import type { Logger } from "../../logger"
import type { SessionState, WithParts } from "../../state"
import { filterMessages } from "../shape"
import {
    buildSubagentResultText,
    getSubAgentId,
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

async function fetchSubAgentMessages(client: any, sessionId: string): Promise<WithParts[]> {
    const response = await client.session.messages({
        path: { id: sessionId },
    })

    return filterMessages(response?.data || response)
}

export const injectExtendedSubAgentResults = async (
    client: any,
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
            if (part.type !== "tool" || part.tool !== "task" || !part.callID) {
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
