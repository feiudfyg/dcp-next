import { getConfig, type PluginConfig } from "../config"
import { Logger } from "../logger"
import { assignMessageRefs } from "../message-ids"
import { createSessionState, type SessionState, type WithParts } from "../state"
import { loadSessionState } from "../state/persistence"
import { findLastCompactionTimestamp, loadPruneMap, loadPruneMessagesState } from "../state/utils"
import { normalizeSessionMessages } from "../v2/messages"
import type { TuiApi } from "./types"

export const logger = new Logger(false)

export function loadConfig(api: TuiApi): PluginConfig {
    return getConfig({ directory: api.state.path.directory })
}

let fallbackSessionID: string | undefined

export function setFallbackSessionID(sessionID: string | undefined): void {
    fallbackSessionID = sessionID
}

export function activeSessionID(api: TuiApi): string | undefined {
    const current = api.route.current
    if (current.name === "session") {
        const sessionID = current.params?.sessionID
        if (typeof sessionID === "string") {
            return sessionID
        }
    }
    return fallbackSessionID
}

async function fetchFullMessages(api: TuiApi, sessionID: string): Promise<WithParts[]> {
    const client = api.client as unknown as {
        session?: { context?: (options: unknown) => Promise<unknown> }
        message?: { list?: (options: unknown) => Promise<unknown> }
    }

    try {
        if (client.session?.context) {
            const raw = (await client.session.context({ sessionID })) as unknown[]
            if (Array.isArray(raw) && raw.length > 0) {
                return normalizeSessionMessages(raw, sessionID)
            }
        }
    } catch {
        // fall through to message.list
    }

    try {
        if (client.message?.list) {
            const response: any = await client.message.list({ sessionID })
            const payload = response?.data ?? response
            const items = Array.isArray(payload)
                ? payload
                : Array.isArray(payload?.items)
                  ? payload.items
                  : []
            if (items.length > 0) {
                return normalizeSessionMessages(items, sessionID)
            }
        }
    } catch {
        // no messages available
    }

    return []
}

export async function sessionMessages(api: TuiApi, sessionID: string): Promise<WithParts[]> {
    const messages = await fetchFullMessages(api, sessionID)
    return messages.sort((left, right) => left.info.time.created - right.info.time.created)
}

export async function buildSessionState(
    sessionID: string,
    messages: WithParts[],
    config: PluginConfig,
): Promise<SessionState> {
    const state = createSessionState()
    state.sessionId = sessionID
    state.manualMode = config.manualMode.enabled ? "active" : false
    state.lastCompaction = findLastCompactionTimestamp(messages)
    assignMessageRefs(state, messages)

    const persisted = await loadSessionState(sessionID, logger)
    if (persisted) {
        if (typeof persisted.manualMode === "boolean") {
            state.manualMode = persisted.manualMode ? "active" : false
        }

        state.prune.tools = loadPruneMap(persisted.prune.tools)
        state.prune.messages = loadPruneMessagesState(persisted.prune.messages)
        state.nudges.contextLimitAnchors = new Set(persisted.nudges.contextLimitAnchors || [])
        state.nudges.turnNudgeAnchors = new Set(persisted.nudges.turnNudgeAnchors || [])
        state.nudges.iterationNudgeAnchors = new Set(persisted.nudges.iterationNudgeAnchors || [])
        state.stats = {
            pruneTokenCounter: persisted.stats?.pruneTokenCounter || 0,
            totalPruneTokens: persisted.stats?.totalPruneTokens || 0,
        }
    }

    return state
}

export async function loadSessionData(api: TuiApi, config: PluginConfig) {
    const sessionID = activeSessionID(api)
    if (!sessionID) return undefined

    const messages = await sessionMessages(api, sessionID)
    const state = await buildSessionState(sessionID, messages, config)
    return { state, messages }
}

export type SessionData = NonNullable<Awaited<ReturnType<typeof loadSessionData>>>
