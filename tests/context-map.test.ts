import assert from "node:assert/strict"
import test from "node:test"
import { assignMessageRefs } from "../lib/message-ids"
import { createSessionState, type CompressionBlock, type WithParts } from "../lib/state"
import { buildContextMap } from "../lib/tui/context-map"

function message(id: string, role: "user" | "assistant", created: number, text: string): WithParts {
    return {
        info: { id, role, sessionID: "ses_map", time: { created } } as WithParts["info"],
        parts: [{ type: "text", text }] as WithParts["parts"],
    }
}

function block(overrides: Partial<CompressionBlock>): CompressionBlock {
    return {
        blockId: 1,
        runId: 1,
        active: true,
        deactivatedByUser: false,
        compressedTokens: 1000,
        summaryTokens: 100,
        durationMs: 0,
        topic: "topic",
        startId: "m0002",
        endId: "m0003",
        anchorMessageId: "m0002",
        compressMessageId: "m0005",
        includedBlockIds: [],
        consumedBlockIds: [],
        parentBlockIds: [],
        directMessageIds: [],
        directToolIds: [],
        effectiveMessageIds: [],
        effectiveToolIds: [],
        createdAt: 0,
        summary: "",
        ...overrides,
    } as CompressionBlock
}

test("buildContextMap collapses consecutive compressed messages into one entry", () => {
    const state = createSessionState()
    const messages = [
        message("m1", "user", 1, "hello"),
        message("m2", "assistant", 2, "working"),
        message("m3", "user", 3, "more"),
        message("m4", "assistant", 4, "done"),
    ]
    assignMessageRefs(state, messages)

    state.prune.messages.blocksById.set(1, block({}))
    state.prune.messages.byMessageId.set("m2", {
        tokenCount: 500,
        allBlockIds: [1],
        activeBlockIds: [1],
    })
    state.prune.messages.byMessageId.set("m3", {
        tokenCount: 500,
        allBlockIds: [1],
        activeBlockIds: [1],
    })

    const entries = buildContextMap(state, messages)
    assert.equal(entries.length, 3)

    assert.equal(entries[0].kind, "message")
    assert.deepEqual(entries[0], {
        kind: "message",
        ref: "m0001",
        role: "user",
        preview: "hello",
    })

    assert.equal(entries[1].kind, "compressed")
    if (entries[1].kind === "compressed") {
        assert.equal(entries[1].blockId, 1)
        assert.equal(entries[1].startRef, "m0002")
        assert.equal(entries[1].endRef, "m0003")
        assert.equal(entries[1].messageCount, 2)
        assert.equal(entries[1].compressedTokens, 1000)
    }

    assert.equal(entries[2].kind, "message")
    if (entries[2].kind === "message") {
        assert.equal(entries[2].ref, "m0004")
    }
})

test("buildContextMap keeps separate compressed runs for different blocks", () => {
    const state = createSessionState()
    const messages = [
        message("m1", "assistant", 1, "a"),
        message("m2", "assistant", 2, "b"),
        message("m3", "assistant", 3, "c"),
    ]
    assignMessageRefs(state, messages)

    state.prune.messages.blocksById.set(1, block({ blockId: 1 }))
    state.prune.messages.blocksById.set(2, block({ blockId: 2 }))
    state.prune.messages.byMessageId.set("m1", {
        tokenCount: 1,
        allBlockIds: [1],
        activeBlockIds: [1],
    })
    state.prune.messages.byMessageId.set("m2", {
        tokenCount: 1,
        allBlockIds: [2],
        activeBlockIds: [2],
    })

    const entries = buildContextMap(state, messages)
    assert.equal(entries.length, 3)
    assert.equal(entries[0].kind, "compressed")
    assert.equal(entries[1].kind, "compressed")
    assert.equal(entries[2].kind, "message")
})
