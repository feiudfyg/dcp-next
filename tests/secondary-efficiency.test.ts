import assert from "node:assert/strict"
import test from "node:test"
import { createSessionState, type CompressionBlock, type WithParts } from "../lib/state"
import { pruneCompressToolCalls } from "../lib/messages/prune"
import { buildCompressedBlockGuidance } from "../lib/prompts/extensions/nudge"

function makeBlock(blockId: number, compressMessageId: string): CompressionBlock {
    return {
        blockId,
        runId: 1,
        active: true,
        deactivatedByUser: false,
        compressedTokens: 100,
        summaryTokens: 10,
        durationMs: 0,
        mode: "range",
        topic: "t",
        batchTopic: "t",
        startId: "m0001",
        endId: "m0002",
        anchorMessageId: "anchor",
        compressMessageId,
        includedBlockIds: [],
        consumedBlockIds: [],
        parentBlockIds: [],
        directMessageIds: [],
        directToolIds: [],
        effectiveMessageIds: [],
        effectiveToolIds: [],
        createdAt: 0,
        summary: "[Compressed conversation section]",
    }
}

function compressToolPart(summary: string) {
    return {
        type: "tool",
        tool: "compress",
        callID: "call-1",
        state: {
            status: "completed",
            input: { topic: "t", content: [{ startId: "m0001", endId: "m0002", summary }] },
            output: "Compressed 2 messages",
        },
    } as any
}

test("pruneCompressToolCalls hides the summary payload of older active block origins", () => {
    const state = createSessionState()
    state.prune.messages.activeBlockIds.add(1)
    state.prune.messages.activeBlockIds.add(2)
    state.prune.messages.blocksById.set(1, makeBlock(1, "msg-old"))
    state.prune.messages.blocksById.set(2, makeBlock(2, "msg-new"))

    const messages: WithParts[] = [
        {
            info: { id: "msg-old", role: "assistant" } as WithParts["info"],
            parts: [compressToolPart("OLD SUMMARY")],
        },
        {
            info: { id: "msg-new", role: "assistant" } as WithParts["info"],
            parts: [compressToolPart("NEW SUMMARY")],
        },
    ]

    pruneCompressToolCalls(state, messages)

    const oldSummary = messages[0]!.parts[0]!.state.input.content[0].summary
    assert.notEqual(oldSummary, "OLD SUMMARY")
    assert.match(oldSummary, /compress call args hidden/)

    assert.equal(messages[1]!.parts[0]!.state.input.content[0].summary, "NEW SUMMARY")
})

test("pruneCompressToolCalls leaves non-origin compress calls intact", () => {
    const state = createSessionState()
    state.prune.messages.activeBlockIds.add(1)
    state.prune.messages.blocksById.set(1, makeBlock(1, "some-other-message"))

    const messages: WithParts[] = [
        {
            info: { id: "msg-compress", role: "assistant" } as WithParts["info"],
            parts: [compressToolPart("KEEP ME")],
        },
    ]

    pruneCompressToolCalls(state, messages)

    assert.equal(messages[0]!.parts[0]!.state.input.content[0].summary, "KEEP ME")
})

test("buildCompressedBlockGuidance suggests the oldest uncompressed assistant messages", () => {
    const state = createSessionState()
    state.messageIds.byRawId.set("u1", "m0001")
    state.messageIds.byRawId.set("a1", "m0002")
    state.messageIds.byRawId.set("a2", "m0003")
    state.messageIds.byRawId.set("a3", "m0004")

    const messages: WithParts[] = [
        { info: { id: "u1", role: "user" } as WithParts["info"], parts: [] },
        { info: { id: "a1", role: "assistant" } as WithParts["info"], parts: [] },
        { info: { id: "a2", role: "assistant" } as WithParts["info"], parts: [] },
        { info: { id: "a3", role: "assistant" } as WithParts["info"], parts: [] },
    ]

    const text = buildCompressedBlockGuidance(state, true, messages)
    assert.match(text, /Oldest uncompressed messages to consider: m0002, m0003, m0004/)
    assert.doesNotMatch(text, /m0001/)
})
