/** @jsxImportSource @opentui/solid */

import { buildStatsReport } from "../commands/stats"
import type { PluginConfig } from "../config"
import { saveManualModeSetting } from "../state/persistence"
import { loadSessionData, logger } from "./data"
import { ContextDialog, ContextMapDialog, PanelDialog, StatsDialog, StatusDialog } from "./dialogs"
import {
    runCompress,
    runDecompress,
    runDecompressBlock,
    runHelp,
    runRecompress,
    runSweep,
} from "./actions"
import type { TuiApi } from "./types"

function dialogSize(api: TuiApi): "medium" | "large" | "xlarge" {
    const width = api.renderer?.terminalWidth ?? 0
    if (width >= 128) return "xlarge"
    if (width >= 96) return "large"
    return "medium"
}

export function showDialog(api: TuiApi, render: () => any) {
    api.ui.dialog.setSize(dialogSize(api))
    api.ui.dialog.replace(render)
}

export function showStatusDialog(
    api: TuiApi,
    title: string,
    eyebrow: string,
    message: string,
    onBack?: () => void,
) {
    showDialog(api, () => (
        <StatusDialog api={api} title={title} eyebrow={eyebrow} message={message} onBack={onBack} />
    ))
}

export function showError(api: TuiApi, title: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    showStatusDialog(api, title, "DCP Error", message || "Command failed.")
}

export function openContextModal(api: TuiApi, config: PluginConfig) {
    runModal(api, "Context", async () => {
        const data = await loadSessionData(api, config)
        if (!data) {
            showStatusDialog(api, "Context", "No session", "Open a session first.")
            return
        }
        showDialog(api, () => (
            <ContextDialog
                api={api}
                state={data.state}
                messages={data.messages}
                onBack={() => openPanelModal(api, config)}
            />
        ))
    })
}

export function openStatsModal(api: TuiApi, config: PluginConfig) {
    runModal(api, "Stats", async () => {
        const data = await loadSessionData(api, config)
        if (!data) {
            showStatusDialog(api, "Stats", "No session", "Open a session first.")
            return
        }
        const report = await buildStatsReport(data.state, logger)
        showDialog(api, () => (
            <StatsDialog api={api} report={report} onBack={() => openPanelModal(api, config)} />
        ))
    })
}

export function openContextMapModal(api: TuiApi, config: PluginConfig) {
    runModal(api, "Context map", async () => {
        const data = await loadSessionData(api, config)
        if (!data) {
            showStatusDialog(api, "Context map", "No session", "Open a session first.")
            return
        }
        showDialog(api, () => (
            <ContextMapDialog
                api={api}
                state={data.state}
                messages={data.messages}
                onBack={() => openPanelModal(api, config)}
            />
        ))
    })
}

export function openPanelModal(api: TuiApi, config: PluginConfig) {
    runModal(api, "DCP", async () => {
        const data = await loadSessionData(api, config)
        if (!data) {
            showStatusDialog(api, "DCP", "No session", "Open a session first.")
            return
        }
        showDialog(api, () => (
            <PanelDialog
                api={api}
                state={data.state}
                messages={data.messages}
                config={config}
                onContext={() => openContextModal(api, config)}
                onContextMap={() => openContextMapModal(api, config)}
                onStats={() => openStatsModal(api, config)}
                onManual={(enabled) => setManualMode(api, config, data.state.sessionId, enabled)}
                onSweep={() => runSweep(api, config)}
                onDecompress={() => runDecompress(api, config)}
                onRecompress={() => runRecompress(api, config)}
                onCompress={() => runCompress(api, config)}
                onDecompressBlock={(blockId) => runDecompressBlock(api, config, blockId)}
                onHelp={() => runHelp(api, config)}
            />
        ))
    })
}

function runModal(api: TuiApi, title: string, task: () => Promise<void>) {
    showStatusDialog(api, title, "DCP", "Loading...")
    void task().catch((error) => showError(api, title, error))
}

async function setManualMode(
    api: TuiApi,
    config: PluginConfig,
    sessionID: string | null | undefined,
    enabled: boolean,
) {
    if (!sessionID) return
    await saveManualModeSetting(sessionID, enabled, logger)
    openPanelModal(api, config)
}
