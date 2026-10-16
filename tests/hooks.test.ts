import assert from "node:assert/strict"
import test from "node:test"
import type { PluginConfig } from "../lib/config"
import { createContextHookHandler } from "../lib/hooks"
import { Logger } from "../lib/logger"
import {
    createSessionState,
    refreshManualMode,
    saveManualModeSetting,
    type WithParts,
} from "../lib/state"

function buildConfig(permission: "allow" | "ask" | "deny" = "allow"): PluginConfig {
    return {
        enabled: true,
        debug: false,
        pruneNotification: "off",
        pruneNotificationType: "chat",
        commands: {
            enabled: true,
            protectedTools: [],
        },
        manualMode: {
            enabled: false,
            automaticStrategies: true,
        },
        turnProtection: {
            enabled: false,
            turns: 4,
        },
        experimental: {
            allowSubAgents: false,
            customPrompts: false,
        },
        protectedFilePatterns: [],
        compress: {
            mode: "message",
            permission,
            showCompression: false,
            maxContextLimit: 150000,
            minContextLimit: 50000,
            nudgeFrequency: 5,
            iterationNudgeThreshold: 15,
            nudgeForce: "soft",
            protectedTools: ["task"],
            protectTags: false,
            protectUserMessages: false,
            triggers: { contextLimit: true, turn: true, iteration: true },
        },
        strategies: {
            deduplication: {
                enabled: true,
                protectedTools: [],
            },
            purgeErrors: {
                enabled: true,
                turns: 4,
                protectedTools: [],
            },
        },
    }
}

function buildPrompts() {
    return {
        reload() {},
        getRuntimePrompts() {
            return {
                system: "DCP-RUNTIME-PROMPT",
                manualExtension: "",
                subagentExtension: "",
            }
        },
    } as any
}

function buildClient(overrides: Record<string, any> = {}) {
    return {
        model: {
            list: async () => [{ providerID: "p", id: "m", limit: { context: 200000 } }],
        },
        agent: { list: async () => [] },
        session: {
            context: async () => [],
            get: async () => ({ parentID: null, data: { parentID: null } }),
            messages: async () => ({ data: [] }),
            synthetic: async () => ({}),
            prompt: async () => ({}),
        },
        ...overrides,
    } as any
}

function userRequest(id = "m1") {
    return { id, role: "user", content: [{ type: "text", text: "hi" }] }
}

function buildEvent(system: string[], messages: any[], sessionID = "session-1") {
    return {
        sessionID,
        model: { providerID: "p", id: "m" },
        system: system.map((text) => ({ type: "text" as const, text })),
        messages,
    }
}

test("context hook caches the resolved model context limit", async () => {
    const state = createSessionState()
    const handler = createContextHookHandler(
        buildClient(),
        state,
        new Logger(false),
        buildConfig("deny"),
        buildPrompts(),
        { global: undefined, agents: {} },
    )

    await handler(buildEvent(["base system"], [userRequest()]) as any)

    assert.equal(state.modelContextLimit, 200000)
})

test("context hook injects the DCP system prompt for the main session", async () => {
    const state = createSessionState()
    const handler = createContextHookHandler(
        buildClient(),
        state,
        new Logger(false),
        buildConfig("allow"),
        buildPrompts(),
        { global: undefined, agents: {} },
    )

    const event = buildEvent(["You are the primary coding assistant."], [userRequest()])
    await handler(event as any)

    const joined = event.system.map((part) => part.text).join("\n")
    assert.match(joined, /DCP-RUNTIME-PROMPT/)
})

test("context hook skips injection for internal agent calls", async () => {
    const state = createSessionState()
    const handler = createContextHookHandler(
        buildClient(),
        state,
        new Logger(false),
        buildConfig("allow"),
        buildPrompts(),
        { global: undefined, agents: {} },
    )

    const event = buildEvent(
        ["You are a title generator. Return only a short title."],
        [userRequest()],
    )
    await handler(event as any)

    const joined = event.system.map((part) => part.text).join("\n")
    assert.doesNotMatch(joined, /DCP-RUNTIME-PROMPT/)
})

test("context hook does not crash on malformed request messages", async () => {
    const state = createSessionState()
    const handler = createContextHookHandler(
        buildClient(),
        state,
        new Logger(false),
        buildConfig("deny"),
        buildPrompts(),
        { global: undefined, agents: {} },
    )

    const event = buildEvent(["base"], [{ role: "user", parts: [{ type: "text", text: "junk" }] }])
    await handler(event as any)

    assert.ok(Array.isArray(event.messages))
})

test("manual mode persisted setting refreshes server session state", async () => {
    const logger = new Logger(false)
    const sessionId = `manual-mode-${Date.now()}-${Math.random().toString(16).slice(2)}`

    await saveManualModeSetting(sessionId, true, logger)

    const state = createSessionState()
    state.sessionId = sessionId
    state.manualMode = false

    await refreshManualMode(state, sessionId, logger, false)
    assert.equal(state.manualMode, "active")

    await saveManualModeSetting(sessionId, false, logger)
    await refreshManualMode(state, sessionId, logger, true)
    assert.equal(state.manualMode, false)
})
