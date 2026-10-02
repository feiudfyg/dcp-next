/** @jsxImportSource @opentui/solid */

import type { PluginConfig } from "../config"
import {
    getActiveCompressionTargets,
    getRecompressibleCompressionTargets,
} from "../commands/compression-targets"
import { handleDecompressCommand } from "../commands/decompress"
import { handleRecompressCommand } from "../commands/recompress"
import { handleSweepCommand } from "../commands/sweep"
import { formatTokenCount } from "../ui/utils"
import { loadSessionData, logger } from "./data"
import { HelpDialog } from "./dialogs"
import { openPanelModal, showDialog, showError, showStatusDialog } from "./modals"
import type { TuiApi } from "./types"

type SessionData = NonNullable<Awaited<ReturnType<typeof loadSessionData>>>

function actionContext(api: TuiApi, config: PluginConfig, data: SessionData) {
    return {
        client: api.client as any,
        state: data.state,
        config,
        logger,
        sessionId: data.state.sessionId as string,
        messages: data.messages,
    }
}

async function withSession(
    api: TuiApi,
    config: PluginConfig,
    title: string,
    task: (data: SessionData) => Promise<void>,
): Promise<void> {
    try {
        const data = await loadSessionData(api, config)
        if (!data || !data.state.sessionId) {
            showStatusDialog(api, title, "No session", "Open a session first.")
            return
        }
        await task(data)
    } catch (error) {
        showError(api, title, error)
    }
}

export function runSweep(api: TuiApi, config: PluginConfig) {
    void withSession(api, config, "Sweep", async (data) => {
        showDialog(api, () =>
            api.ui.DialogConfirm({
                title: "Sweep",
                message: "Prune tool messages since the last user message now?",
                onConfirm: () => {
                    void performSweep(api, config, data)
                },
                onCancel: () => openPanelModal(api, config),
            }),
        )
    })
}

async function performSweep(api: TuiApi, config: PluginConfig, data: SessionData): Promise<void> {
    try {
        const before = data.state.prune.tools.size
        await handleSweepCommand({
            ...actionContext(api, config, data),
            args: [],
            workingDirectory: api.state.path.directory,
        })
        const pruned = data.state.prune.tools.size - before
        const message =
            pruned > 0
                ? `Pruned ${pruned} tool output${pruned === 1 ? "" : "s"} since the last user message.`
                : "Nothing to prune since the last user message."
        showStatusDialog(api, "Sweep", "DCP", message, () => openPanelModal(api, config))
    } catch (error) {
        showError(api, "Sweep", error)
    }
}

export function runHelp(api: TuiApi, config: PluginConfig) {
    void withSession(api, config, "Help", async (data) => {
        showDialog(api, () => (
            <HelpDialog
                api={api}
                state={data.state}
                config={config}
                onBack={() => openPanelModal(api, config)}
            />
        ))
    })
}

export function runDecompress(api: TuiApi, config: PluginConfig) {
    void withSession(api, config, "Decompress", async (data) => {
        const targets = getActiveCompressionTargets(data.state.prune.messages)
        if (targets.length === 0) {
            showStatusDialog(api, "Decompress", "DCP", "No active compressions to restore.")
            return
        }
        showDialog(api, () =>
            api.ui.DialogSelect({
                title: "Decompress a compression",
                options: targets.map((target) => ({
                    title: `b${target.displayId}  ${target.topic.replace(/\s+/g, " ").trim() || "(no topic)"}`,
                    value: String(target.displayId),
                    description: `~${formatTokenCount(target.compressedTokens)} · Compression #${target.runId}${target.grouped ? ` (${target.blocks.length} messages)` : ""}`,
                })),
                onSelect: (option) => {
                    void applyBlockAction(
                        api,
                        config,
                        data,
                        "Decompress",
                        String(option.value),
                        handleDecompressCommand,
                    )
                },
            }),
        )
    })
}

export function runDecompressBlock(api: TuiApi, config: PluginConfig, blockId: number) {
    void withSession(api, config, "Decompress", async (data) => {
        await applyBlockAction(
            api,
            config,
            data,
            "Decompress",
            String(blockId),
            handleDecompressCommand,
        )
    })
}

export function runRecompress(api: TuiApi, config: PluginConfig) {
    void withSession(api, config, "Recompress", async (data) => {
        const availableMessageIds = new Set(data.messages.map((message) => message.info.id))
        const targets = getRecompressibleCompressionTargets(
            data.state.prune.messages,
            availableMessageIds,
        )
        if (targets.length === 0) {
            showStatusDialog(api, "Recompress", "DCP", "No decompressed compressions to re-apply.")
            return
        }
        showDialog(api, () =>
            api.ui.DialogSelect({
                title: "Recompress a compression",
                options: targets.map((target) => ({
                    title: `b${target.displayId}  ${target.topic.replace(/\s+/g, " ").trim() || "(no topic)"}`,
                    value: String(target.displayId),
                    description: `~${formatTokenCount(target.compressedTokens)} · Compression #${target.runId}${target.grouped ? ` (${target.blocks.length} messages)` : ""}`,
                })),
                onSelect: (option) => {
                    void applyBlockAction(
                        api,
                        config,
                        data,
                        "Recompress",
                        String(option.value),
                        handleRecompressCommand,
                    )
                },
            }),
        )
    })
}

async function applyBlockAction(
    api: TuiApi,
    config: PluginConfig,
    data: SessionData,
    title: string,
    arg: string,
    handler: (ctx: any) => Promise<void>,
): Promise<void> {
    try {
        await handler({
            ...actionContext(api, config, data),
            args: arg ? [arg] : [],
        })
    } catch (error) {
        showError(api, title, error)
        return
    }
    openPanelModal(api, config)
}

export function runCompress(api: TuiApi, config: PluginConfig) {
    void withSession(api, config, "Compress", async (data) => {
        showDialog(api, () =>
            api.ui.DialogPrompt({
                title: "Compress now",
                placeholder: "optional focus, e.g. the auth refactor",
                onConfirm: (value) => {
                    void startCompress(api, config, data, value.trim())
                },
                onCancel: () => openPanelModal(api, config),
            }),
        )
    })
}

async function startCompress(
    api: TuiApi,
    config: PluginConfig,
    data: SessionData,
    focus: string,
): Promise<void> {
    try {
        await (api.client as any).session.command({
            sessionID: data.state.sessionId,
            command: "dcp-compress",
            arguments: focus,
        })
    } catch (error) {
        showError(api, "Compress", error)
        return
    }
    api.ui.dialog.clear()
}
