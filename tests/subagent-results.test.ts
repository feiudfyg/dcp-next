import assert from "node:assert/strict"
import test from "node:test"
import { Logger } from "../lib/logger"
import { getSubAgentId, mergeSubagentResult } from "../lib/subagents/subagent-results"
import { injectExtendedSubAgentResults } from "../lib/messages/inject/subagent-results"
import { createSessionState } from "../lib/state"

function taskPart(callID: string, metadata: Record<string, unknown>, output: string) {
    return {
        type: "tool",
        callID,
        tool: "task",
        state: { status: "completed", input: {}, output, metadata },
    }
}

const childRaw = [
    { type: "user", id: "cu", text: "do it", time: { created: 1 } },
    {
        type: "assistant",
        id: "ca",
        agent: "build",
        model: { id: "m", providerID: "p" },
        content: [{ type: "text", text: "CHILD RESULT" }],
        time: { created: 2 },
    },
]

test("getSubAgentId reads both sessionId and sessionID metadata keys", () => {
    assert.equal(getSubAgentId({ state: { metadata: { sessionId: "a" } } }), "a")
    assert.equal(getSubAgentId({ state: { metadata: { sessionID: "b" } } }), "b")
    assert.equal(getSubAgentId({ state: { metadata: { sessionId: "  c " } } }), "c")
    assert.equal(getSubAgentId({ state: { metadata: {} } }), null)
    assert.equal(getSubAgentId({ state: {} }), null)
})

test("mergeSubagentResult replaces the task_result body", () => {
    const merged = mergeSubagentResult("<task_result>\nold body\n</task_result>", "new body")
    assert.match(merged, /new body/)
    assert.doesNotMatch(merged, /old body/)
})

test("injectExtendedSubAgentResults expands task output and caches it", async () => {
    const state = createSessionState()
    const logger = new Logger(false)
    const messages = [
        {
            info: { id: "m1", sessionID: "ses", role: "assistant", time: { created: 1 } },
            parts: [
                taskPart(
                    "c1",
                    { sessionID: "child" },
                    "<task_result>\nplaceholder\n</task_result>",
                ),
            ],
        },
    ]

    let calls = 0
    const client = {
        session: {
            context: async () => {
                calls++
                return childRaw
            },
        },
    }

    await injectExtendedSubAgentResults(client as any, state, logger, messages as any, true)

    const output = (messages[0].parts[0] as any).state.output as string
    assert.match(output, /CHILD RESULT/)
    assert.doesNotMatch(output, /placeholder/)
    assert.equal(state.subAgentResultCache.get("c1"), "CHILD RESULT")
    assert.equal(calls, 1)

    const throwingClient = {
        session: {
            context: async () => {
                throw new Error("should not be called")
            },
        },
    }
    await injectExtendedSubAgentResults(throwingClient as any, state, logger, messages as any, true)
    assert.match((messages[0].parts[0] as any).state.output, /CHILD RESULT/)
})

test("injectExtendedSubAgentResults skips non-task parts and disabled subagents", async () => {
    const state = createSessionState()
    const logger = new Logger(false)
    const parts = [taskPart("c1", { sessionID: "child" }, "<task_result>x</task_result>")]
    const messages = [
        { info: { id: "m1", sessionID: "ses", role: "assistant", time: { created: 1 } }, parts },
    ]
    let calls = 0
    const client = {
        session: {
            context: async () => {
                calls++
                return childRaw
            },
        },
    }
    await injectExtendedSubAgentResults(client as any, state, logger, messages as any, false)
    assert.equal(calls, 0)
    assert.equal((parts[0] as any).state.output, "<task_result>x</task_result>")
})
