/** @jsxImportSource @opentui/solid */

import { StatusDialog } from "./dialogs"
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
