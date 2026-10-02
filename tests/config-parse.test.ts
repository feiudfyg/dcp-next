import assert from "node:assert/strict"
import test from "node:test"
import { parseConfigContent } from "../lib/config"

test("parseConfigContent accepts JSONC with comments and trailing commas", () => {
    const result = parseConfigContent(`{
        // a comment
        "enabled": true,
        "compress": { "mode": "range", },
    }`)
    assert.equal(result.parseError, undefined)
    assert.equal(result.data?.enabled, true)
    assert.equal(result.data?.compress?.mode, "range")
})

test("parseConfigContent reports syntax errors instead of silently returning partial data", () => {
    const result = parseConfigContent('{ "enabled": tru, "debug": }')
    assert.equal(result.data, null)
    assert.match(result.parseError ?? "", /Invalid JSON syntax/)
})

test("parseConfigContent rejects an empty file", () => {
    const result = parseConfigContent("   \n\t ")
    assert.equal(result.data, null)
    assert.match(result.parseError ?? "", /empty/)
})

test("parseConfigContent rejects non-object roots", () => {
    const arrayResult = parseConfigContent("[1, 2, 3]")
    assert.equal(arrayResult.data, null)
    assert.match(arrayResult.parseError ?? "", /JSON object/)

    const scalarResult = parseConfigContent('"hello"')
    assert.equal(scalarResult.data, null)
    assert.match(scalarResult.parseError ?? "", /JSON object/)
})

test("parseConfigContent returns the parsed object for valid input", () => {
    const result = parseConfigContent('{ "debug": true }')
    assert.equal(result.parseError, undefined)
    assert.deepEqual(result.data, { debug: true })
})
