import assert from "node:assert/strict"
import test from "node:test"
import { internalToRequest, normalizeSessionMessages, requestToInternal } from "../lib/v2/messages"

test("requestToInternal maps user/assistant and folds tool calls + results", () => {
    const request = [
        { id: "m1", role: "user", content: [{ type: "text", text: "hi" }] },
        {
            id: "m2",
            role: "assistant",
            content: [
                { type: "text", text: "working" },
                { type: "tool-call", id: "c1", name: "read", input: { p: "x" } },
            ],
        },
        {
            role: "tool",
            content: [
                {
                    type: "tool-result",
                    id: "c1",
                    name: "read",
                    result: { type: "text", value: "OUT" },
                },
            ],
        },
    ]
    const session = [
        { type: "user", id: "m1", text: "hi", time: { created: 1 } },
        {
            type: "assistant",
            id: "m2",
            agent: "build",
            model: { id: "mdl", providerID: "prov" },
            tokens: { input: 10, output: 5, reasoning: 1, cache: { read: 2, write: 3 } },
            content: [
                { type: "text", text: "working" },
                {
                    type: "tool",
                    id: "c1",
                    name: "read",
                    state: {
                        status: "completed",
                        input: { p: "x" },
                        content: [{ type: "text", text: "OUT" }],
                    },
                },
            ],
            time: { created: 2 },
        },
    ]

    const internal = requestToInternal(request, session, "ses")
    assert.equal(internal.length, 2)
    assert.equal(internal[0].info.id, "m1")
    assert.equal(internal[0].info.role, "user")
    assert.equal(internal[0].parts[0].type, "text")
    assert.equal((internal[0].parts[0] as any).text, "hi")

    assert.equal(internal[1].info.role, "assistant")
    assert.equal(internal[1].info.tokens?.input, 10)
    assert.equal(internal[1].info.model?.modelID, "mdl")
    const tool = internal[1].parts.find((p) => p.type === "tool") as any
    assert.ok(tool)
    assert.equal(tool.callID, "c1")
    assert.equal(tool.state.status, "completed")
    assert.equal(tool.state.output, "OUT")

    const rebuilt = internalToRequest(internal, request)
    assert.equal(rebuilt.length, 3)
    assert.equal(rebuilt[0].role, "user")
    assert.deepEqual(rebuilt[0].content, [{ type: "text", text: "hi" }])
    assert.ok(rebuilt[1].content.some((p) => p.type === "tool-call" && p.id === "c1"))
    assert.equal(rebuilt[2].role, "tool")
    assert.ok(rebuilt[2].content.some((p) => p.type === "tool-result" && p.id === "c1"))
})

test("unmodeled parts are preserved verbatim (media, compaction)", () => {
    const media = {
        type: "media",
        media: { kind: "image", source: { type: "url", url: "https://example/x.png" } },
    }
    const compaction = { type: "compaction", provider: "anthropic", text: "ckpt" }
    const request = [
        { id: "m1", role: "user", content: [{ type: "text", text: "see" }, media] },
        { id: "m2", role: "assistant", content: [{ type: "text", text: "ok" }, compaction] },
    ]

    const internal = requestToInternal(request, [], "ses")
    assert.equal(
        internal[0].parts.some((p) => p.type === "opaque"),
        true,
    )

    const rebuilt = internalToRequest(internal, request)
    assert.deepEqual(rebuilt[0].content[1], media)
    assert.deepEqual(rebuilt[1].content[1], compaction)
})

test("correlation works without message ids and ignores role:tool messages", () => {
    const request = [
        { role: "user", content: [{ type: "text", text: "hi" }] },
        { role: "assistant", content: [{ type: "tool-call", id: "c9", name: "read", input: {} }] },
        {
            role: "tool",
            content: [
                {
                    type: "tool-result",
                    id: "c9",
                    name: "read",
                    result: { type: "text", value: "R" },
                },
            ],
        },
    ]
    const session = [
        { type: "user", id: "u1", text: "hi", time: { created: 1 } },
        {
            type: "assistant",
            id: "a1",
            content: [
                {
                    type: "tool",
                    id: "c9",
                    name: "read",
                    state: {
                        status: "completed",
                        input: {},
                        content: [{ type: "text", text: "R" }],
                    },
                },
            ],
            time: { created: 2 },
        },
    ]

    const internal = requestToInternal(request, session, "ses")
    assert.equal(internal[0].info.id, "u1")
    assert.equal(internal[1].info.id, "a1")
})

test("synthetic summary messages rebuild as fresh user messages", () => {
    const internal = [
        {
            info: {
                id: "msg_dcp_summary_abc",
                sessionID: "ses",
                role: "user",
                time: { created: 5 },
            },
            parts: [{ type: "text", text: "SUMMARY" }],
        },
    ]
    const rebuilt = internalToRequest(internal as any, [])
    assert.equal(rebuilt.length, 1)
    assert.equal(rebuilt[0].role, "user")
    assert.deepEqual(rebuilt[0].content, [{ type: "text", text: "SUMMARY" }])
})

test("normalizeSessionMessages keeps model-visible messages and marks compaction", () => {
    const raw = [
        { type: "user", id: "u", text: "hi", time: { created: 1 } },
        { type: "system", id: "s", text: "sys", time: { created: 2 } },
        {
            type: "assistant",
            id: "a",
            agent: "build",
            model: { id: "m", providerID: "p" },
            content: [{ type: "text", text: "yo" }],
            time: { created: 3 },
        },
        { type: "compaction", id: "c", time: { created: 4 } },
    ]
    const norm = normalizeSessionMessages(raw, "ses")
    assert.deepEqual(
        norm.map((m) => m.info.id),
        ["u", "a", "c"],
    )
    assert.equal(norm[2].info.summary, true)
})
