import assert from "node:assert/strict"
import test from "node:test"
import { analyzeContextTokens } from "../lib/commands/context"
import { createSessionState, type WithParts } from "../lib/state"

function textPart(messageID: string, sessionID: string, id: string, text: string) {
    return {
        id,
        messageID,
        sessionID,
        type: "text" as const,
        text,
    }
}

function toolPart(
    messageID: string,
    sessionID: string,
    id: string,
    callID: string,
    output: string,
) {
    return {
        id,
        messageID,
        sessionID,
        type: "tool" as const,
        callID,
        tool: "bash",
        state: {
            status: "completed" as const,
            input: { command: "echo hi" },
            output,
        },
    }
}

function buildMessages(): WithParts[] {
    const sessionID = "ses_context_order"

    return [
        {
            info: {
                id: "msg-user-1",
                role: "user",
                sessionID,
                time: { created: 1 },
            } as WithParts["info"],
            parts: [textPart("msg-user-1", sessionID, "p1", "What is the plan for today?")],
        },
        {
            info: {
                id: "msg-assistant-1",
                role: "assistant",
                sessionID,
                time: { created: 2 },
                tokens: { input: 1000, output: 100, reasoning: 0, cache: { read: 0, write: 0 } },
            } as WithParts["info"],
            parts: [
                textPart("msg-assistant-1", sessionID, "p2", "Here is the plan."),
                toolPart("msg-assistant-1", sessionID, "p3", "call_1", "tool output ".repeat(20)),
            ],
        },
        {
            info: {
                id: "msg-user-2",
                role: "user",
                sessionID,
                time: { created: 3 },
            } as WithParts["info"],
            parts: [textPart("msg-user-2", sessionID, "p4", "Continue please.")],
        },
        {
            info: {
                id: "msg-assistant-2",
                role: "assistant",
                sessionID,
                time: { created: 4 },
                tokens: { input: 0, output: 200, reasoning: 0, cache: { read: 20000, write: 0 } },
            } as WithParts["info"],
            parts: [textPart("msg-assistant-2", sessionID, "p5", "Done.")],
        },
    ]
}

test("analyzeContextTokens is independent of message ordering", () => {
    const state = createSessionState()
    const messages = buildMessages()

    const ascending = analyzeContextTokens(state, messages)
    const descending = analyzeContextTokens(state, [...messages].reverse())

    assert.equal(ascending.total, descending.total)
    assert.equal(ascending.system, descending.system)
    assert.equal(ascending.user, descending.user)
    assert.equal(ascending.tools, descending.tools)
    assert.equal(ascending.assistant, descending.assistant)
})

test("analyzeContextTokens never reports a category above the total", () => {
    const state = createSessionState()
    const messages = buildMessages()

    for (const ordered of [messages, [...messages].reverse()]) {
        const breakdown = analyzeContextTokens(state, ordered)
        assert.ok(breakdown.total > 0, "total should be reported")
        assert.ok(breakdown.system <= breakdown.total, "system must not exceed total")
        assert.ok(breakdown.user <= breakdown.total, "user must not exceed total")
        assert.ok(breakdown.tools <= breakdown.total, "tools must not exceed total")
        assert.ok(breakdown.assistant <= breakdown.total, "assistant must not exceed total")
    }
})
