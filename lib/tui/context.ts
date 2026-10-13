import { Plugin } from "@opencode/plugin/tui"
import { resolveTheme, type TuiApi } from "./types"

/**
 * Adapt the OpenCode v2 TUI `Context` to DCP's stable `TuiApi` surface.
 *
 * Route names map onto `context.ui.router` plugin pages; `navigate("session")`
 * and `navigate("home")` map onto the built-in destinations.
 */
export function createTuiApi(context: Plugin.Context): TuiApi {
    const route: TuiApi["route"] = {
        get current() {
            const current = context.ui.router.current() as any
            if (current?.type === "plugin") {
                return { name: current.name, params: current.data }
            }
            if (current?.type === "session") {
                return { name: "session", params: { sessionID: current.sessionID } }
            }
            return { name: current?.type ?? "home" }
        },
        register(pages) {
            for (const page of pages) {
                context.ui.router.register({
                    name: page.name,
                    render: (input) => page.render({ params: input?.data }) as any,
                })
            }
        },
        navigate(name, params) {
            if (name === "session") {
                context.ui.router.navigate({
                    type: "session",
                    sessionID: String(params?.sessionID ?? ""),
                })
                return
            }
            if (name === "home") {
                context.ui.router.navigate({ type: "home" })
                return
            }
            context.ui.router.navigate({ type: "plugin", name, data: params })
        },
    }

    return {
        client: context.client,
        renderer: {
            terminalWidth: context.renderer.width,
            terminalHeight: context.renderer.height,
        },
        theme: { current: resolveTheme(context.theme) },
        ui: {
            dialog: {
                clear: () => context.ui.dialog.clear(),
                setSize: (size) => context.ui.dialog.set({ size }),
                replace: (render) => context.ui.dialog.show(render as () => any),
            },
        },
        route,
        state: {
            path: {
                directory: context.location?.directory ?? process.cwd(),
                worktree: context.location?.directory,
            },
        },
    }
}
