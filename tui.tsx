/** @jsxImportSource @opentui/solid */

import type { TuiPluginModule } from "@opencode-ai/plugin/tui"
import { registerCommands } from "./lib/tui/commands"
import { loadConfig } from "./lib/tui/data"
import { openPanelRoute } from "./lib/tui/modals"
import { registerPanelRoute } from "./lib/tui/page"

const tui: TuiPluginModule["tui"] = async (api) => {
    const config = loadConfig(api)
    if (!config.enabled || !config.commands.enabled) return

    registerPanelRoute(api, config)

    registerCommands(api, [
        {
            title: "DCP",
            name: "dcp.panel",
            description: "Open DCP panel",
            slashName: "dcp-panel",
            run: () => void openPanelRoute(api, config),
        },
    ])
}

export default {
    id: "opencode-dcp",
    tui,
} satisfies TuiPluginModule
