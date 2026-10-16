import assert from "node:assert/strict"
import test from "node:test"
import { Logger } from "../lib/logger"
import { checkSession, createSessionState } from "../lib/state"

test("checkSession detects compaction from a separate session transcript", async () => {
    const sessionId = "ses_cmp_reset_test"
    const state = createSessionState()
    state.sessionId = sessionId
    state.prune.messages.blocksById.set(1, { blockId: 1, active: true } as any)
    state.prune.messages.activeBlockIds.add(1)

    const messages = [
        {
            info: { id: "u1", sessionID: sessionId, role: "user", time: { created: 1 } },
            parts: [{ type: "text", text: "hi" }],
        },
    ]
    const compactionSource = [
        {
            info: { id: "u1", sessionID: sessionId, role: "user", time: { created: 1 } },
            parts: [{ type: "text", text: "hi" }],
        },
        {
            info: {
                id: "c1",
                sessionID: sessionId,
                role: "assistant",
                summary: true,
                time: { created: 99 },
            },
            parts: [],
        },
    ]

    const client = {
        session: {
            get: async () => ({ data: {} }),
        },
    }

    await checkSession(
        client as any,
        state,
        new Logger(false),
        messages as any,
        false,
        compactionSource as any,
    )

    assert.equal(state.lastCompaction, 99)
    assert.equal(state.prune.messages.blocksById.size, 0)
    assert.equal(state.prune.messages.activeBlockIds.size, 0)
})

test("checkSession ignores compaction when the transcript has no newer marker", async () => {
    const sessionId = "ses_cmp_reset_test_2"
    const state = createSessionState()
    state.sessionId = sessionId
    state.lastCompaction = 100

    const messages = [
        {
            info: { id: "u1", sessionID: sessionId, role: "user", time: { created: 1 } },
            parts: [{ type: "text", text: "hi" }],
        },
    ]
    const client = { session: { get: async () => ({ data: {} }) } }

    await checkSession(
        client as any,
        state,
        new Logger(false),
        messages as any,
        false,
        messages as any,
    )
    assert.equal(state.lastCompaction, 100)
})
