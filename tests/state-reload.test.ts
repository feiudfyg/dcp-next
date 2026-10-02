import assert from "node:assert/strict"
import test from "node:test"
import { createSessionState } from "../lib/state"
import { reloadSessionStateIfChanged, saveSessionState } from "../lib/state/persistence"
import { Logger } from "../lib/logger"

test("reloadSessionStateIfChanged reloads state written by another process", async () => {
    const logger = new Logger(false)
    const state = createSessionState()
    state.sessionId = `ses_test_reload_${Date.now()}`
    state.prune.tools.set("call-1", 10)
    await saveSessionState(state, logger)

    await new Promise((resolve) => setTimeout(resolve, 5))

    const external = createSessionState()
    external.sessionId = state.sessionId
    external.prune.tools.set("call-2", 20)
    await saveSessionState(external, logger)

    assert.equal(state.prune.tools.has("call-2"), false)

    const reloaded = await reloadSessionStateIfChanged(state, logger)

    assert.equal(reloaded, true)
    assert.equal(state.prune.tools.has("call-2"), true)
})

test("reloadSessionStateIfChanged is a no-op when the persisted state did not change", async () => {
    const logger = new Logger(false)
    const state = createSessionState()
    state.sessionId = `ses_test_reload_noop_${Date.now()}`
    await saveSessionState(state, logger)

    const reloaded = await reloadSessionStateIfChanged(state, logger)

    assert.equal(reloaded, false)
})
