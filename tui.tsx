/** @jsxImportSource @opentui/solid */

import { Plugin } from "@opencode/plugin/tui"
import { createTuiApi } from "./lib/tui/context"
import { loadConfig } from "./lib/tui/data"
import { openPanelRoute, registerPanelRoute } from "./lib/tui/page"

export default Plugin.define({
    id: "opencode-dcp",
    setup(context) {
        const api = createTuiApi(context)
        const config = loadConfig(api)
        if (!config.enabled || !config.commands.enabled) {
            return
        }

        registerPanelRoute(api, config)

        context.keymap.layer(() => ({
            mode: "global",
            commands: [
                {
                    id: "dcp.panel",
                    title: "DCP",
                    description: "Open DCP panel",
                    group: "DCP",
                    palette: true,
                    slash: { name: "dcp-panel" },
                    run: () => void openPanelRoute(api, config),
                },
            ],
        }))
    },
})
