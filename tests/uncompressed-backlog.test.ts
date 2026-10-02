import assert from "node:assert/strict"
import test from "node:test"
import { createSessionState, type WithParts } from "../lib/state"
import { findOldestUncompressedSpan } from "../lib/token-utils"

function buildMessage(id: string, text: string): WithParts {
    return {
        info: { id, role: "assistant" } as WithParts["info"],
        parts: [{ type: "text", text } as WithParts["parts"][number]],
    }
}

function assignRef(
    state: ReturnType<typeof createSessionState>,
    id: string,
    index: number,
): string {
    const ref = `m${String(index).padStart(4, "0")}`
    state.messageIds.byRawId.set(id, ref)
    state.messageIds.byRef.set(ref, id)
    return ref
}

test("findOldestUncompressedSpan returns the oldest qualifying contiguous run", () => {
    const state = createSessionState()
    const messages: WithParts[] = []
    for (let i = 1; i <= 30; i++) {
        const id = `msg-${i}`
        assignRef(state, id, i)
        messages.push(buildMessage(id, "x".repeat(400)))
    }

    const span = findOldestUncompressedSpan(state, messages, 20, 20000)
    assert.ok(span)
    assert.equal(span.startRef, "m0001")
    assert.equal(span.endRef, "m0030")
    assert.equal(span.messageCount, 30)
    assert.ok(span.tokens > 0)
})

test("findOldestUncompressedSpan skips active compressed messages and does not bridge gaps", () => {
    const state = createSessionState()
    const messages: WithParts[] = []
    for (let i = 1; i <= 40; i++) {
        const id = `msg-${i}`
        assignRef(state, id, i)
        messages.push(buildMessage(id, "x".repeat(400)))
    }
    for (let i = 1; i <= 5; i++) {
        state.prune.messages.byMessageId.set(`msg-${i}`, {
            tokenCount: 100,
            allBlockIds: [1],
            activeBlockIds: [1],
        })
    }

    const span = findOldestUncompressedSpan(state, messages, 20, 20000)
    assert.ok(span)
    assert.equal(span.startRef, "m0006")
    assert.equal(span.endRef, "m0040")
    assert.equal(span.messageCount, 35)
})

test("findOldestUncompressedSpan returns null below the thresholds", () => {
    const state = createSessionState()
    const messages: WithParts[] = []
    for (let i = 1; i <= 5; i++) {
        const id = `msg-${i}`
        assignRef(state, id, i)
        messages.push(buildMessage(id, "x".repeat(40)))
    }

    assert.equal(findOldestUncompressedSpan(state, messages, 20, 20000), null)
})
