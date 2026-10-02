/** @jsxImportSource @opentui/solid */

import { buildStatsReport } from "../commands/stats"
import type { PluginConfig } from "../config"
import { saveManualModeSetting } from "../state/persistence"
import { activeSessionID, loadSessionData, logger } from "./data"
import {
    ContextDialog,
    ContextMapDialog,
    StatsDialog,
    StatusDialog,
    type PanelBodyProps,
} from "./dialogs"
import {
    runCompress,
    runDecompress,
    runDecompressBlock,
    runHelp,
    runRecompress,
    runSweep,
} from "./actions"
import type { TuiApi } from "./types"

export const PANEL_ROUTE = "dcp-panel"

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

export async function openPanelRoute(api: TuiApi, config: PluginConfig): Promise<void> {
    const data = await loadSessionData(api, config)
    api.ui.dialog.clear()
    if (!data || !data.state.sessionId) {
        showStatusDialog(api, "DCP", "No session", "Open a session first.")
        return
    }
    api.route.navigate(PANEL_ROUTE, { sessionID: data.state.sessionId, data })
}

export function openPanelModal(api: TuiApi, config: PluginConfig) {
    void openPanelRoute(api, config)
}

export function panelHandlers(
    api: TuiApi,
    config: PluginConfig,
): Omit<PanelBodyProps, "api" | "state" | "messages" | "config" | "wide" | "scrollHeight"> {
    return {
        onContext: () => openContextModal(api, config),
        onContextMap: () => openContextMapModal(api, config),
        onStats: () => openStatsModal(api, config),
        onManual: (enabled) => void setManualMode(api, config, activeSessionID(api), enabled),
        onSweep: () => runSweep(api, config),
        onDecompress: () => runDecompress(api, config),
        onRecompress: () => runRecompress(api, config),
        onCompress: () => runCompress(api, config),
        onDecompressBlock: (blockId) => runDecompressBlock(api, config, blockId),
        onHelp: () => runHelp(api, config),
    }
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

function runModal(api: TuiApi, title: string, task: () => Promise<void>) {
    showStatusDialog(api, title, "DCP", "Loading...")
    void task().catch((error) => showError(api, title, error))
}

async function setManualMode(
    api: TuiApi,
    config: PluginConfig,
    sessionID: string | null | undefined,
    enabled: boolean,
): Promise<void> {
    if (!sessionID) return
    await saveManualModeSetting(sessionID, enabled, logger)
    await openPanelRoute(api, config)
}
