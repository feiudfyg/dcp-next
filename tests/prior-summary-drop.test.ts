import assert from "node:assert/strict"
import test from "node:test"
import { discardMissingBlockSummaries } from "../lib/compress/range-utils"

test("discardMissingBlockSummaries consumes omitted prior blocks without appending text", () => {
    const result = discardMissingBlockSummaries("kept body", [3, 5], [5])

    assert.equal(result.expandedSummary, "kept body")
    assert.deepEqual(result.consumedBlockIds, [5, 3])
})

test("discardMissingBlockSummaries preserves already consumed ids and skips duplicates", () => {
    const result = discardMissingBlockSummaries("body", [1, 2, 3], [2, 1])

    assert.equal(result.expandedSummary, "body")
    assert.deepEqual(result.consumedBlockIds, [2, 1, 3])
})
