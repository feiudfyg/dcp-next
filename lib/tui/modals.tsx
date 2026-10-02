/** @jsxImportSource @opentui/solid */

import { buildStatsReport } from "../commands/stats"
import type { PluginConfig } from "../config"
import { loadSessionData, logger, setFallbackSessionID } from "./data"
import { StatusDialog } from "./dialogs"
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

export async function openPanelRoute(
    api: TuiApi,
    config: PluginConfig,
    view = "panel",
): Promise<void> {
    const data = await loadSessionData(api, config)
    api.ui.dialog.clear()
    if (!data || !data.state.sessionId) {
        showStatusDialog(api, "DCP", "No session", "Open a session first.")
        return
    }

    setFallbackSessionID(data.state.sessionId)

    const params: Record<string, unknown> = {
        sessionID: data.state.sessionId,
        data,
        view,
    }
    if (view === "stats") {
        params.report = await buildStatsReport(data.state, logger)
    }
    api.route.navigate(PANEL_ROUTE, params)
}

export function openPanelModal(api: TuiApi, config: PluginConfig) {
    void openPanelRoute(api, config)
}
