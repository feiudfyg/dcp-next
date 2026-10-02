/**
 * DCP Help command handler.
 * Shows available DCP commands and their descriptions.
 */

import type { Logger } from "../logger"
import type { SdkClient } from "../sdk-types"
import type { PluginConfig } from "../config"
import type { SessionState, WithParts } from "../state"
import { compressPermission } from "../compress-permission"
import { sendIgnoredMessage } from "../ui/notification"
import { getCurrentParams } from "../token-utils"

export interface HelpCommandContext {
    client: SdkClient
    state: SessionState
    config: PluginConfig
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

function getVisibleCommands(state: SessionState, config: PluginConfig): [string, string][] {
    const commands: [string, string][] = [
        [
            "/dcp-panel",
            "Open the DCP panel: context, stats, sweep, decompress, recompress, manual mode",
        ],
    ]

    if (compressPermission(state, config) !== "deny") {
        commands.push(["/dcp-compress [focus]", "Ask the model to run the compress tool now"])
    }

    return commands
}

export function formatHelpMessage(state: SessionState, config: PluginConfig): string {
    const commands = getVisibleCommands(state, config)
    const colWidth = Math.max(...commands.map(([cmd]) => cmd.length)) + 4
    const lines: string[] = []

    lines.push("╭─────────────────────────────────────────────────────────────────────────╮")
    lines.push("│                              DCP Commands                               │")
    lines.push("╰─────────────────────────────────────────────────────────────────────────╯")
    lines.push("")
    lines.push(`  ${"Manual mode:".padEnd(colWidth)}${state.manualMode ? "ON" : "OFF"}`)
    lines.push("")
    lines.push("  Open /dcp-panel for context, stats, sweep, decompress and recompress.")
    lines.push("  Use /dcp-compress [focus] when you want DCP to ask the model to run compression.")
    lines.push("")
    for (const [cmd, desc] of commands) {
        lines.push(`  ${cmd.padEnd(colWidth)}${desc}`)
    }
    lines.push("")

    return lines.join("\n")
}

export async function handleHelpCommand(ctx: HelpCommandContext): Promise<void> {
    const { client, state, logger, sessionId, messages } = ctx

    const { config } = ctx
    const message = formatHelpMessage(state, config)

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(client, sessionId, message, params, logger)

    logger.info("Help command executed")
}
