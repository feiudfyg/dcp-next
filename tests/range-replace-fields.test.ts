import assert from "node:assert/strict"
import test from "node:test"
import { createSessionState, type WithParts } from "../lib/state"
import { assignMessageRefs } from "../lib/message-ids"
import { buildSearchContext } from "../lib/compress/search"
import { resolveRanges } from "../lib/compress/range-utils"

function textPart(messageID: string, sessionID: string, id: string, text: string) {
    return {
        id,
        messageID,
        sessionID,
        type: "text" as const,
        text,
    }
}

function buildMessages(sessionID: string): WithParts[] {
    return [
        {
            info: {
                id: "msg-user-1",
                role: "user",
                sessionID,
                agent: "build",
                model: { providerID: "anthropic", modelID: "claude-test" },
                time: { created: 1 },
            } as WithParts["info"],
            parts: [textPart("msg-user-1", sessionID, "part-1", "First user message")],
        },
        {
            info: {
                id: "msg-assistant-1",
                role: "assistant",
                sessionID,
                agent: "build",
                time: { created: 2 },
            } as WithParts["info"],
            parts: [textPart("msg-assistant-1", sessionID, "part-2", "Assistant reply")],
        },
        {
            info: {
                id: "msg-user-2",
                role: "user",
                sessionID,
                agent: "build",
                model: { providerID: "anthropic", modelID: "claude-test" },
                time: { created: 3 },
            } as WithParts["info"],
            parts: [textPart("msg-user-2", sessionID, "part-3", "Second user message")],
        },
    ]
}

test("resolveRanges preserves replaceBlockIds on the resolved entry", () => {
    const sessionID = `ses_range_replace_${Date.now()}`
    const rawMessages = buildMessages(sessionID)
    const state = createSessionState()
    state.sessionId = sessionID
    assignMessageRefs(state, rawMessages)

    const searchContext = buildSearchContext(state, rawMessages)
    const plans = resolveRanges(
        {
            topic: "replace regression",
            content: [
                {
                    startId: "m0001",
                    endId: "m0002",
                    summary: "condensed summary",
                    replaceBlockIds: ["b4", "b5"],
                },
            ],
        },
        searchContext,
        state,
    )

    assert.equal(plans.length, 1)
    assert.deepEqual(plans[0]!.entry.replaceBlockIds, ["b4", "b5"])
})
