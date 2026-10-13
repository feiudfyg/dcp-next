import type { RGBA } from "@opentui/core"
import { Plugin } from "@opencode/plugin/tui"
import type { buildStatsReport } from "../commands/stats"

/**
 * DCP's TUI view-model. The OpenCode v2 theme exposes a different token layout
 * (`text.base`, `hue.accent[500]`, `background.raised.base`, ...); this flat
 * adapter keeps the presentation components stable across the v2 port.
 */
export interface Theme {
    primary: RGBA
    accent: RGBA
    success: RGBA
    error: RGBA
    info: RGBA
    warning: RGBA
    borderSubtle: RGBA
    background: RGBA
    backgroundElement: RGBA
    selectedListItemText: RGBA
    text: RGBA
    textMuted: RGBA
    thinkingOpacity?: number
}

export type ThemeColor = Exclude<keyof Theme, "thinkingOpacity">

export type DialogSize = "medium" | "large" | "xlarge"

export function resolveTheme(theme: Plugin.Context["theme"]): Theme {
    return {
        primary: theme.text.action.primary.base,
        accent: theme.hue.accent[500],
        success: theme.text.feedback.success.base,
        error: theme.text.feedback.error.base,
        info: theme.text.feedback.info.base,
        warning: theme.text.feedback.warning.base,
        borderSubtle: theme.border.base,
        background: theme.background.base,
        backgroundElement: theme.background.raised.base,
        selectedListItemText: theme.background.raised.high,
        text: theme.text.base,
        textMuted: theme.text.muted,
    }
}

export interface RegisteredPage {
    name: string
    render: (input: { params?: Record<string, unknown> }) => unknown
}

/**
 * Compatibility surface over the v2 TUI `Context` so the route/dialog/theme
 * code keeps a single, stable shape.
 */
export interface TuiApi {
    client: Plugin.Context["client"]
    renderer: { terminalWidth: number; terminalHeight: number }
    theme: { current: Theme }
    ui: {
        dialog: {
            clear(): void
            setSize(size: DialogSize): void
            replace(render: () => unknown): void
        }
    }
    route: {
        current: { name: string; params?: Record<string, unknown> }
        register(pages: RegisteredPage[]): void
        navigate(name: string, params?: Record<string, unknown>): void
    }
    state: { path: { directory: string; worktree?: string } }
}

export type StatsReport = Awaited<ReturnType<typeof buildStatsReport>>
