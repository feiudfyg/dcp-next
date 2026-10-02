import { getConfig, type PluginConfig } from "../config"
import { Logger } from "../logger"
import { assignMessageRefs } from "../message-ids"
import { filterMessages } from "../messages/shape"
import { createSessionState, type SessionState, type WithParts } from "../state"
import { loadSessionState } from "../state/persistence"
import { findLastCompactionTimestamp, loadPruneMap, loadPruneMessagesState } from "../state/utils"
import type { TuiApi } from "./types"

export const logger = new Logger(false)

export function loadConfig(api: TuiApi): PluginConfig {
    return getConfig({
        client: api.client,
        directory: api.state.path.directory,
        worktree: api.state.path.worktree,
    } as any)
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
    try {
        const client = api.client as unknown as {
            session: { messages: (options: unknown) => Promise<unknown> }
        }
        const response = await client.session.messages({ path: { sessionID } })
        const data = (response as { data?: unknown })?.data ?? response
        return filterMessages(data)
    } catch {
        return []
    }
}

export function fallbackSessionMessages(api: TuiApi, sessionID: string): WithParts[] {
    return filterMessages(
        api.state.session.messages(sessionID).map((info) => ({
            info,
            parts: api.state.part(info.id),
        })) as unknown as WithParts[],
    )
}

export async function sessionMessages(api: TuiApi, sessionID: string): Promise<WithParts[]> {
    let messages = await fetchFullMessages(api, sessionID)
    if (messages.length === 0) {
        messages = fallbackSessionMessages(api, sessionID)
    }
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
