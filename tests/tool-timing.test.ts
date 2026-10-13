import assert from "node:assert/strict"
import test from "node:test"
import { createToolTimingHandlers } from "../lib/hooks"
import { Logger } from "../lib/logger"
import { createSessionState } from "../lib/state"

function seedBlock(
    state: ReturnType<typeof createSessionState>,
    messageId: string,
    callId: string,
) {
    state.prune.messages.blocksById.set(1, {
        blockId: 1,
        compressMessageId: messageId,
        compressCallId: callId,
        durationMs: 0,
    } as any)
}

test("timing handlers attach a duration to the matching compression block", async () => {
    const state = createSessionState()
    state.sessionId = "ses_timing_test"
    seedBlock(state, "msg1", "call1")

    const { before, after } = createToolTimingHandlers(state, new Logger(false))
    before({ tool: "compress", sessionID: state.sessionId, messageID: "msg1", id: "call1" })
    await new Promise((r) => setTimeout(r, 5))
    await after({
        tool: "compress",
        sessionID: state.sessionId,
        messageID: "msg1",
        id: "call1",
        status: "completed",
    })

    const block = state.prune.messages.blocksById.get(1)!
    assert.ok(block.durationMs >= 1, `expected duration >= 1, got ${block.durationMs}`)
})

test("timing handlers ignore non-compress tools and unpaired calls", async () => {
    const state = createSessionState()
    state.sessionId = "ses_timing_test2"
    seedBlock(state, "msg1", "call1")

    const { before, after } = createToolTimingHandlers(state, new Logger(false))
    before({ tool: "read", sessionID: state.sessionId, messageID: "msg1", id: "call1" })
    await after({
        tool: "read",
        sessionID: state.sessionId,
        messageID: "msg1",
        id: "call1",
        status: "completed",
    })
    // after without a matching before is a no-op
    await after({
        tool: "compress",
        sessionID: state.sessionId,
        messageID: "msg1",
        id: "call1",
        status: "completed",
    })

    const block = state.prune.messages.blocksById.get(1)!
    assert.equal(block.durationMs, 0)
})
