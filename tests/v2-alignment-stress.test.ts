import assert from "node:assert/strict"
import test from "node:test"
import { internalToRequest, requestToInternal } from "../lib/v2/messages"

function buildTranscript(turns: number) {
    const request: any[] = []
    const session: any[] = []
    for (let t = 0; t < turns; t++) {
        request.push({ role: "user", content: [{ type: "text", text: `u${t}` }] })
        request.push({
            role: "assistant",
            content: [
                { type: "text", text: `a${t}` },
                { type: "tool-call", id: `c${t}`, name: "read", input: {} },
            ],
        })
        request.push({
            role: "tool",
            content: [
                {
                    type: "tool-result",
                    id: `c${t}`,
                    name: "read",
                    result: { type: "text", value: `r${t}` },
                },
            ],
        })

        session.push({ type: "user", id: `u${t}`, text: `u${t}`, time: { created: 2 * t + 1 } })
        session.push({
            type: "assistant",
            id: `a${t}`,
            agent: "build",
            model: { id: "m", providerID: "p" },
            tokens: { input: t + 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
            content: [
                { type: "text", text: `a${t}` },
                {
                    type: "tool",
                    id: `c${t}`,
                    name: "read",
                    state: {
                        status: "completed",
                        input: {},
                        content: [{ type: "text", text: `r${t}` }],
                    },
                },
            ],
            time: { created: 2 * t + 2 },
        })
    }
    return { request, session }
}

test("alignment maps every turn of a long id-less transcript", () => {
    const turns = 30
    const { request, session } = buildTranscript(turns)
    const internal = requestToInternal(request, session, "ses")

    assert.equal(internal.length, turns * 2)
    for (let t = 0; t < turns; t++) {
        assert.equal(internal[2 * t].info.id, `u${t}`, `user turn ${t}`)
        assert.equal(internal[2 * t + 1].info.id, `a${t}`, `assistant turn ${t}`)
        assert.equal(internal[2 * t + 1].info.tokens?.input, t + 1)
        const tool = internal[2 * t + 1].parts.find((p) => p.type === "tool") as any
        assert.equal(tool.state.output, `r${t}`)
    }
})

test("long transcript rebuild emits one tool message per assistant tool call", () => {
    const turns = 12
    const { request, session } = buildTranscript(turns)
    const internal = requestToInternal(request, session, "ses")
    const rebuilt = internalToRequest(internal, request)

    const roles = rebuilt.map((m) => m.role)
    assert.equal(roles.filter((r) => r === "user").length, turns)
    assert.equal(roles.filter((r) => r === "assistant").length, turns)
    assert.equal(roles.filter((r) => r === "tool").length, turns)

    const toolMsgs = rebuilt.filter((m) => m.role === "tool")
    toolMsgs.forEach((m, i) => {
        assert.ok(m.content.some((p: any) => p.type === "tool-result" && p.id === `c${i}`))
    })
})
