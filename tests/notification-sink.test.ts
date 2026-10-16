import assert from "node:assert/strict"
import test from "node:test"
import { Logger } from "../lib/logger"
import { sendIgnoredMessage } from "../lib/ui/notification"

test("sendIgnoredMessage routes to session.synthetic on a v2-style client", async () => {
    const calls: Array<{ sessionID: string; text: string }> = []
    const client = {
        session: {
            synthetic: async (input: { sessionID: string; text: string }) => {
                calls.push(input)
            },
        },
    }
    await sendIgnoredMessage(client as any, "ses_1", "hello", {}, new Logger(false))
    assert.deepEqual(calls, [{ sessionID: "ses_1", text: "hello" }])
})

test("sendIgnoredMessage routes to a direct Notify sink", async () => {
    const calls: Array<{ sessionID: string; text: string }> = []
    const sink = {
        message: (sessionID: string, text: string) => {
            calls.push({ sessionID, text })
        },
    }
    await sendIgnoredMessage(sink as any, "ses_2", "direct", {}, new Logger(false))
    assert.deepEqual(calls, [{ sessionID: "ses_2", text: "direct" }])
})

test("sendIgnoredMessage falls back to session.prompt with ignored parts", async () => {
    const prompts: any[] = []
    const client = {
        session: {
            prompt: async (input: any) => {
                prompts.push(input)
            },
        },
    }
    await sendIgnoredMessage(client as any, "ses_3", "legacy", {}, new Logger(false))
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0].body.noReply, true)
    assert.equal(prompts[0].body.parts[0].ignored, true)
})

test("sendIgnoredMessage swallows sink errors", async () => {
    const client = {
        session: {
            synthetic: async () => {
                throw new Error("boom")
            },
        },
    }
    await sendIgnoredMessage(client as any, "ses_4", "x", {}, new Logger(false))
})
