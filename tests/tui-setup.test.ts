import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

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

test("tui setup registers the /dcp-panel command and panel routes", async () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "dcp-tui-"))
    process.env.XDG_CONFIG_HOME = path.join(sandbox, ".config")
    process.env.HOME = sandbox
    process.env.USERPROFILE = sandbox

    const { default: tui } = await import("../tui")

    const layers: any[] = []
    const registrations: any[] = []
    const context = {
        client: { tag: "client" },
        renderer: { width: 100, height: 40 },
        location: { directory: sandbox },
        theme: themeTokens,
        ui: {
            router: {
                current: () => ({ type: "home" }),
                register: (page: any) => {
                    registrations.push(page)
                    return () => {}
                },
                navigate: () => {},
            },
            dialog: { clear: () => {}, show: () => {}, set: () => {} },
        },
        keymap: {
            layer: (factory: () => any) => {
                layers.push(factory())
            },
        },
    } as any

    await tui.setup(context)

    assert.ok(layers.length >= 1, "expected a keymap layer")
    const command = layers[0].commands.find((c: any) => c.id === "dcp.panel")
    assert.ok(command, "expected dcp.panel command")
    assert.equal(layers[0].mode, "global")
    assert.equal(command.slash.name, "dcp-panel")
    assert.equal(typeof command.run, "function")

    assert.ok(registrations.length >= 5, `expected panel routes, got ${registrations.length}`)
    assert.ok(
        registrations.some((r) => r.name === "dcp-panel"),
        "expected a dcp-panel route",
    )
})
