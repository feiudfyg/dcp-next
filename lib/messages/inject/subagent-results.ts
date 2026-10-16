import type { Logger } from "../../logger"
import type { SdkClient } from "../../sdk-types"
import type { SessionState, WithParts } from "../../state"
import { normalizeSessionMessages } from "../../v2/messages"
import { filterMessages } from "../shape"
import {
    buildSubagentResultText,
    getSubAgentId,
    isSubAgentTool,
    mergeSubagentResult,
} from "../../subagents/subagent-results"
import { stripHallucinationsFromString } from "../utils"

const MAX_SUBAGENT_RESULT_CACHE_SIZE = 500

function trimSubAgentResultCache(state: SessionState): void {
    if (state.subAgentResultCache.size <= MAX_SUBAGENT_RESULT_CACHE_SIZE) {
        return
    }

    const excess = state.subAgentResultCache.size - MAX_SUBAGENT_RESULT_CACHE_SIZE
    let removed = 0
    for (const key of state.subAgentResultCache.keys()) {
        state.subAgentResultCache.delete(key)
        if (++removed >= excess) {
            break
        }
    }
}

async function fetchSubAgentMessages(client: SdkClient, sessionId: string): Promise<WithParts[]> {
    const session = (client as any)?.session
    if (session && typeof session.context === "function") {
        const raw = (await session.context({ sessionID: sessionId })) as unknown[]
        const list = Array.isArray(raw) ? raw : []
        if (list.length > 0 && (list[0] as any)?.info) {
            return filterMessages(list)
        }
        return normalizeSessionMessages(list, sessionId)
    }
    if (session && typeof session.messages === "function") {
        const response = await session.messages({ path: { id: sessionId } })
        return filterMessages(response?.data || response)
    }
    return []
}

export const injectExtendedSubAgentResults = async (
    client: SdkClient,
    state: SessionState,
    logger: Logger,
    messages: WithParts[],
    allowSubAgents: boolean,
): Promise<void> => {
    if (!allowSubAgents) {
        return
    }

    for (const message of messages) {
        const parts = Array.isArray(message.parts) ? message.parts : []

        for (const part of parts) {
            if (part.type !== "tool" || !isSubAgentTool(part.tool) || !part.callID) {
                continue
            }
            if (state.prune.tools.has(part.callID)) {
                continue
            }
            if (part.state?.status !== "completed" || typeof part.state.output !== "string") {
                continue
            }

            const cachedResult = state.subAgentResultCache.get(part.callID)
            if (cachedResult !== undefined) {
                if (cachedResult) {
                    part.state.output = stripHallucinationsFromString(
                        mergeSubagentResult(part.state.output, cachedResult),
                    )
                }
                continue
            }

            const subAgentSessionId = getSubAgentId(part)
            if (!subAgentSessionId) {
                continue
            }

            let subAgentMessages: WithParts[] = []
            try {
                subAgentMessages = await fetchSubAgentMessages(client, subAgentSessionId)
            } catch (error) {
                logger.warn("Failed to fetch subagent session for output expansion", {
                    subAgentSessionId,
                    callID: part.callID,
                    error: error instanceof Error ? error.message : String(error),
                })
                continue
            }

            const subAgentResultText = buildSubagentResultText(subAgentMessages)
            if (!subAgentResultText) {
                continue
            }

            state.subAgentResultCache.set(part.callID, subAgentResultText)
            part.state.output = stripHallucinationsFromString(
                mergeSubagentResult(part.state.output, subAgentResultText),
            )
        }
    }

    trimSubAgentResultCache(state)
}
