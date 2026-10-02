import assert from "node:assert/strict"
import test from "node:test"
import { formatCompressionResult } from "../lib/compress/result"
import { applyCompressionState } from "../lib/compress/state"
import type { CompressionOutcome, SelectionResolution } from "../lib/compress/types"
import { createSessionState, type CompressionBlock } from "../lib/state"

function makeOutcome(overrides: Partial<CompressionOutcome>): CompressionOutcome {
    return {
        blockId: 1,
        topic: "topic",
        newMessageCount: 1,
        newToolCount: 0,
        compressedTokens: 0,
        consumedSummaryTokens: 0,
        summaryTokens: 0,
        netRemovedTokens: 0,
        consumedBlockIds: [],
        autoNestedBlockIds: [],
        ...overrides,
    }
}

test("formatCompressionResult reports block refs and token deltas", () => {
    const text = formatCompressionResult({
        outcomes: [
            makeOutcome({
                blockId: 3,
                topic: "Auth",
                newMessageCount: 1200,
                compressedTokens: 15000,
                summaryTokens: 1200,
                netRemovedTokens: 13800,
            }),
        ],
    })

    assert.match(text, /^Compressed 1200 new messages into b3\./)
    assert.match(text, /- b3 "Auth": removed 15K, summary 1\.2K, net -13\.8K tokens/)
    assert.doesNotMatch(text, /Warning/)
})

test("formatCompressionResult explains auto-nested prior blocks and ineffective compression", () => {
    const text = formatCompressionResult({
        outcomes: [
            makeOutcome({
                blockId: 4,
                topic: "DB",
                newMessageCount: 5,
                compressedTokens: 10,
                summaryTokens: 50,
                netRemovedTokens: -40,
                consumedBlockIds: [2],
                autoNestedBlockIds: [2],
            }),
        ],
        skippedIssues: ["messageId m0002 is already part of an active compression."],
        skippedCount: 1,
    })

    assert.match(text, /Note: prior blocks b2 were nested in full/)
    assert.match(text, /Warning: b4 did not reduce context \(net \+40 tokens\)/)
    assert.match(text, /Skipped 1 issue:/)
    assert.match(text, /already part of an active compression/)
})

test("formatCompressionResult uses the singular message noun", () => {
    const text = formatCompressionResult({
        outcomes: [makeOutcome({ blockId: 1, newMessageCount: 1, netRemovedTokens: 10 })],
    })
    assert.match(text, /^Compressed 1 new message into b1\./)
})

function buildSelection(messageIds: string[], tokens: Record<string, number>): SelectionResolution {
    return {
        startReference: { kind: "message", rawIndex: 0, messageId: messageIds[0] },
        endReference: { kind: "message", rawIndex: 0, messageId: messageIds[0] },
        messageIds,
        messageTokenById: new Map(Object.entries(tokens)),
        toolIds: [],
        requiredBlockIds: [],
    }
}

function buildPriorBlock(
    blockId: number,
    effectiveMessageIds: string[],
    summaryTokens: number,
): CompressionBlock {
    return {
        blockId,
        runId: 1,
        active: true,
        deactivatedByUser: false,
        compressedTokens: summaryTokens,
        summaryTokens,
        durationMs: 0,
        mode: "range",
        topic: "prior",
        startId: "m0001",
        endId: "m0001",
        anchorMessageId: "anchor",
        compressMessageId: "msg-prior",
        includedBlockIds: [],
        consumedBlockIds: [],
        parentBlockIds: [],
        directMessageIds: [],
        directToolIds: [],
        effectiveMessageIds,
        effectiveToolIds: [],
        createdAt: 0,
        summary: "[Compressed conversation section]",
    }
}

test("applyCompressionState folds consumed summary tokens into the net reduction", () => {
    const state = createSessionState()
    state.prune.messages.byMessageId.set("x", {
        tokenCount: 400,
        allBlockIds: [1],
        activeBlockIds: [1],
    })
    state.prune.messages.blocksById.set(1, buildPriorBlock(1, ["x"], 100))
    state.prune.messages.activeBlockIds.add(1)
    state.prune.messages.activeByAnchorMessageId.set("anchor", 1)

    const applied = applyCompressionState(
        state,
        {
            topic: "t",
            batchTopic: "t",
            startId: "m0002",
            endId: "m0002",
            mode: "range",
            runId: 1,
            compressMessageId: "msg-new",
            summaryTokens: 50,
        },
        buildSelection(["y"], { y: 500 }),
        "anchor-y",
        2,
        "[Compressed conversation section]\nnew summary\n\n",
        [1],
    )

    assert.equal(applied.compressedTokens, 500)
    assert.equal(applied.consumedSummaryTokens, 100)
    assert.equal(applied.netRemovedTokens, 550)
    assert.equal(applied.newlyCompressedMessageIds.length, 1)
    assert.equal(state.prune.messages.blocksById.get(1)?.active, false)
})

test("applyCompressionState reports a negative net when the summary outweighs the removed content", () => {
    const state = createSessionState()

    const applied = applyCompressionState(
        state,
        {
            topic: "t",
            batchTopic: "t",
            startId: "m0002",
            endId: "m0002",
            mode: "message",
            runId: 1,
            compressMessageId: "msg-new",
            summaryTokens: 80,
        },
        buildSelection(["y"], { y: 30 }),
        "anchor-y",
        1,
        "[Compressed conversation section]\nlong summary\n\n",
        [],
    )

    assert.equal(applied.compressedTokens, 30)
    assert.equal(applied.consumedSummaryTokens, 0)
    assert.equal(applied.netRemovedTokens, -50)
})
