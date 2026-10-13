import assert from "node:assert/strict"
import test from "node:test"
import { createTuiApi } from "../lib/tui/context"
import { resolveTheme } from "../lib/tui/types"

const themeTokens = {
    text: {
        base: "TEXT",
        muted: "MUTED",
        action: { primary: { base: "PRIMARY" } },
        feedback: {
            success: { base: "SUCCESS" },
            error: { base: "ERROR" },
            info: { base: "INFO" },
            warning: { base: "WARNING" },
        },
    },
    hue: { accent: { 500: "ACCENT" } },
    border: { base: "BORDER" },
    background: { base: "BG", raised: { base: "BG_RAISED", high: "SEL" } },
}

test("resolveTheme maps v2 theme tokens onto the flat DCP theme", () => {
    const theme = resolveTheme(themeTokens as any)
    assert.equal(theme.primary, "PRIMARY")
    assert.equal(theme.accent, "ACCENT")
    assert.equal(theme.success, "SUCCESS")
    assert.equal(theme.error, "ERROR")
    assert.equal(theme.info, "INFO")
    assert.equal(theme.warning, "WARNING")
    assert.equal(theme.borderSubtle, "BORDER")
    assert.equal(theme.background, "BG")
    assert.equal(theme.backgroundElement, "BG_RAISED")
    assert.equal(theme.selectedListItemText, "SEL")
    assert.equal(theme.text, "TEXT")
    assert.equal(theme.textMuted, "MUTED")
})

function makeContext() {
    const registrations: any[] = []
    const navigations: any[] = []
    const dialogSets: any[] = []
    const state = { current: { type: "home" } as any }
    const context = {
        client: { tag: "client" },
        renderer: { width: 100, height: 40 },
        location: { directory: "E:/proj" },
        theme: themeTokens,
        ui: {
            router: {
                current: () => state.current,
                register: (page: any) => {
                    registrations.push(page)
                    return () => {}
                },
                navigate: (dest: any) => {
                    navigations.push(dest)
                    state.current = dest
                },
            },
            dialog: {
                clear: () => {},
                show: () => {},
                set: (options: any) => dialogSets.push(options),
            },
        },
    }
    return { context: context as any, registrations, navigations, dialogSets, state }
}

test("createTuiApi exposes renderer, client and directory", () => {
    const { context } = makeContext()
    const api = createTuiApi(context)
    assert.equal(api.renderer.terminalWidth, 100)
    assert.equal(api.renderer.terminalHeight, 40)
    assert.equal((api.client as any).tag, "client")
    assert.equal(api.state.path.directory, "E:/proj")
    assert.equal(api.theme.current.primary, "PRIMARY")
})

test("route.register forwards pages and passes data through as params", () => {
    const { context, registrations } = makeContext()
    const api = createTuiApi(context)
    const sawParams: any[] = []
    api.route.register([
        {
            name: "dcp-panel",
            render: (input) => {
                sawParams.push(input.params)
                return "rendered"
            },
        },
    ])
    assert.equal(registrations[0].name, "dcp-panel")
    const result = registrations[0].render({ data: { sessionID: "s1" } })
    assert.equal(result, "rendered")
    assert.deepEqual(sawParams[0], { sessionID: "s1" })
})

test("route.navigate maps panel/session/home destinations", () => {
    const { context, navigations } = makeContext()
    const api = createTuiApi(context)
    api.route.navigate("dcp-panel", { sessionID: "s1" })
    api.route.navigate("session", { sessionID: "s2" })
    api.route.navigate("home")
    assert.deepEqual(navigations[0], {
        type: "plugin",
        name: "dcp-panel",
        data: { sessionID: "s1" },
    })
    assert.deepEqual(navigations[1], { type: "session", sessionID: "s2" })
    assert.deepEqual(navigations[2], { type: "home" })
})

test("route.current projects plugin and session routes", () => {
    const { context, state } = makeContext()
    const api = createTuiApi(context)
    state.current = { type: "plugin", name: "dcp-panel", data: { view: "stats" } }
    assert.deepEqual(api.route.current, { name: "dcp-panel", params: { view: "stats" } })
    state.current = { type: "session", sessionID: "s9" }
    assert.deepEqual(api.route.current, { name: "session", params: { sessionID: "s9" } })
})

test("ui.dialog.setSize delegates to the host dialog", () => {
    const { context, dialogSets } = makeContext()
    const api = createTuiApi(context)
    api.ui.dialog.setSize("large")
    assert.deepEqual(dialogSets[0], { size: "large" })
})
