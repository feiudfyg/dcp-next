import assert from "node:assert/strict"
import test from "node:test"
import type { CompressionBlock } from "../lib/state"
import { wrapCompressedSummary } from "../lib/compress/state"
import {
    appendMissingBlockSummaries,
    injectBlockPlaceholders,
    parseBlockPlaceholders,
    parseReplaceBlockIds,
    validateReplaceBlockIds,
    validateSummaryPlaceholders,
} from "../lib/compress/range-utils"

function makeBlock(blockId: number, body: string): CompressionBlock {
    return {
        blockId,
        runId: 1,
        active: true,
        deactivatedByUser: false,
        compressedTokens: 10,
        summaryTokens: 5,
        durationMs: 0,
        mode: "range",
        topic: "topic",
        batchTopic: "topic",
        startId: "m0001",
        endId: "m0002",
        anchorMessageId: `anchor-${blockId}`,
        compressMessageId: `compress-${blockId}`,
        includedBlockIds: [],
        consumedBlockIds: [],
        parentBlockIds: [],
        directMessageIds: [],
        directToolIds: [],
        effectiveMessageIds: [],
        effectiveToolIds: [],
        createdAt: 0,
        summary: wrapCompressedSummary(blockId, body),
    }
}

test("appendMissingBlockSummaries appends unlisted blocks and only consumes replaced ones", () => {
    const summaryByBlockId = new Map<number, CompressionBlock>([
        [2, makeBlock(2, "KEEP-BODY")],
        [3, makeBlock(3, "REPLACE-BODY")],
    ])

    const result = appendMissingBlockSummaries("new summary", [2, 3], summaryByBlockId, [], [3])

    assert.match(result.expandedSummary, /KEEP-BODY/)
    assert.doesNotMatch(result.expandedSummary, /REPLACE-BODY/)
    assert.deepEqual(result.consumedBlockIds, [2, 3])
})

test("appendMissingBlockSummaries preserves every omitted block when nothing is replaced", () => {
    const summaryByBlockId = new Map<number, CompressionBlock>([
        [2, makeBlock(2, "KEEP-BODY")],
        [3, makeBlock(3, "ALSO-KEEP")],
    ])

    const result = appendMissingBlockSummaries("new summary", [2, 3], summaryByBlockId, [], [])

    assert.match(result.expandedSummary, /KEEP-BODY/)
    assert.match(result.expandedSummary, /ALSO-KEEP/)
    assert.deepEqual(result.consumedBlockIds, [2, 3])
})

test("parseReplaceBlockIds parses and deduplicates block refs", () => {
    const parsed = parseReplaceBlockIds({
        startId: "m0001",
        endId: "m0002",
        summary: "s",
        replaceBlockIds: ["b2", "b2", "b5"],
    })

    assert.deepEqual(parsed, [2, 5])
})

test("parseReplaceBlockIds rejects invalid refs", () => {
    assert.throws(
        () =>
            parseReplaceBlockIds({
                startId: "m0001",
                endId: "m0002",
                summary: "s",
                replaceBlockIds: ["b0"],
            }),
        /Invalid replaceBlockIds entry/,
    )
})

test("validateReplaceBlockIds only requires the block to be inside the range", () => {
    assert.throws(() => validateReplaceBlockIds([9], [2, 3]), /not a prior block/)
    assert.doesNotThrow(() => validateReplaceBlockIds([2], [2, 3]))
    assert.doesNotThrow(() => validateReplaceBlockIds([3], [2, 3]))
})

test("a bN used as both boundary and replaceBlockIds is replaced, not kept", () => {
    const summaryByBlockId = new Map<number, CompressionBlock>([[2, makeBlock(2, "OLD-SUMMARY")]])
    const boundary = {
        kind: "compressed-block" as const,
        rawIndex: 0,
        blockId: 2,
        anchorMessageId: "anchor-2",
    }

    const parsed = parseBlockPlaceholders("new summary")
    const missingBlockIds = validateSummaryPlaceholders(
        parsed,
        [2],
        boundary,
        boundary,
        summaryByBlockId,
        [2],
    )
    assert.deepEqual(missingBlockIds, [2])

    const injected = injectBlockPlaceholders(
        "new summary",
        parsed,
        summaryByBlockId,
        boundary,
        boundary,
        [2],
    )
    assert.equal(injected.expandedSummary, "new summary")
    assert.deepEqual(injected.consumedBlockIds, [])

    const final = appendMissingBlockSummaries(
        injected.expandedSummary,
        missingBlockIds,
        summaryByBlockId,
        injected.consumedBlockIds,
        [2],
    )
    assert.doesNotMatch(final.expandedSummary, /OLD-SUMMARY/)
    assert.deepEqual(final.consumedBlockIds, [2])
})
