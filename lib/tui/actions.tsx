/** @jsxImportSource @opentui/solid */

import type { PluginConfig } from "../config"
import { handleDecompressCommand } from "../commands/decompress"
import { handleHelpCommand } from "../commands/help"
import { handleRecompressCommand } from "../commands/recompress"
import { handleSweepCommand } from "../commands/sweep"
import { loadSessionData, logger } from "./data"
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
        await handleSweepCommand({
            ...actionContext(api, config, data),
            args: [],
            workingDirectory: api.state.path.directory,
        })
        openPanelModal(api, config)
    })
}

export function runHelp(api: TuiApi, config: PluginConfig) {
    void withSession(api, config, "Help", async (data) => {
        await handleHelpCommand(actionContext(api, config, data))
        openPanelModal(api, config)
    })
}

export function runDecompress(api: TuiApi, config: PluginConfig) {
    void withSession(api, config, "Decompress", async (data) => {
        showDialog(api, () =>
            api.ui.DialogPrompt({
                title: "Decompress a compression",
                placeholder: "compression number, e.g. 7",
                onConfirm: (value) => {
                    void applyBlockAction(
                        api,
                        config,
                        data,
                        "Decompress",
                        value.trim(),
                        handleDecompressCommand,
                    )
                },
                onCancel: () => openPanelModal(api, config),
            }),
        )
    })
}

export function runRecompress(api: TuiApi, config: PluginConfig) {
    void withSession(api, config, "Recompress", async (data) => {
        showDialog(api, () =>
            api.ui.DialogPrompt({
                title: "Recompress a compression",
                placeholder: "compression number, e.g. 7",
                onConfirm: (value) => {
                    void applyBlockAction(
                        api,
                        config,
                        data,
                        "Recompress",
                        value.trim(),
                        handleRecompressCommand,
                    )
                },
                onCancel: () => openPanelModal(api, config),
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
