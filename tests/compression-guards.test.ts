import assert from "node:assert/strict"
import test from "node:test"
import { validateArgs as validateRangeArgs } from "../lib/compress/range-utils"
import { validateArgs as validateMessageArgs } from "../lib/compress/message-utils"
import { PRUNED_COMPRESS_ARGS_REPLACEMENT } from "../lib/compress/placeholders"

test("range validateArgs rejects the pruned compress-args placeholder as a summary", () => {
    assert.throws(
        () =>
            validateRangeArgs({
                topic: "t",
                content: [
                    {
                        startId: "m0001",
                        endId: "m0002",
                        summary: PRUNED_COMPRESS_ARGS_REPLACEMENT,
                    },
                ],
            }),
        /placeholder/,
    )
})

test("message validateArgs rejects the pruned compress-args placeholder embedded in a summary", () => {
    assert.throws(
        () =>
            validateMessageArgs({
                topic: "t",
                content: [
                    {
                        messageId: "m0001",
                        topic: "x",
                        summary: `Here you go: ${PRUNED_COMPRESS_ARGS_REPLACEMENT}`,
                    },
                ],
            }),
        /placeholder/,
    )
})

test("validateArgs still accepts a real summary", () => {
    assert.doesNotThrow(() =>
        validateRangeArgs({
            topic: "t",
            content: [{ startId: "m0001", endId: "m0002", summary: "A real technical summary." }],
        }),
    )
})
