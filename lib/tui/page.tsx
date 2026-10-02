/** @jsxImportSource @opentui/solid */

import { TextAttributes } from "@opentui/core"
import type { PluginConfig } from "../config"
import type { SessionData } from "./data"
import { PanelBody, StatusDialog } from "./dialogs"
import { PANEL_ROUTE, panelHandlers } from "./modals"
import { ActionButton } from "./ui"
import type { TuiApi } from "./types"

export function PanelPage(props: {
    api: TuiApi
    config: PluginConfig
    sessionID: string
    data: SessionData
}) {
    const theme = props.api.theme.current
    const height = props.api.renderer?.terminalHeight ?? 40
    const scrollHeight = Math.max(8, height - 12)
    const handlers = panelHandlers(props.api, props.config)
    const back = () => props.api.route.navigate("session", { sessionID: props.sessionID })

    return (
        <box
            width="100%"
            height="100%"
            flexDirection="column"
            paddingLeft={2}
            paddingRight={2}
            paddingTop={1}
            gap={1}
        >
            <box flexDirection="row" justifyContent="space-between" width="100%">
                <box flexDirection="row" gap={2}>
                    <text fg={theme.primary} attributes={TextAttributes.BOLD}>
                        DCP Compression Panel
                    </text>
                    <text fg={theme.textMuted}>{props.sessionID}</text>
                </box>
                <ActionButton
                    theme={theme}
                    label="back to session"
                    variant="primary"
                    onClick={back}
                />
            </box>
            <PanelBody
                api={props.api}
                state={props.data.state}
                messages={props.data.messages}
                config={props.config}
                wide={true}
                scrollHeight={scrollHeight}
                {...handlers}
            />
        </box>
    )
}

export function registerPanelRoute(api: TuiApi, config: PluginConfig) {
    api.route.register([
        {
            name: PANEL_ROUTE,
            render: (input) => {
                const params = (input.params ?? {}) as {
                    sessionID?: string
                    data?: SessionData
                }
                if (!params.data || !params.sessionID) {
                    return (
                        <StatusDialog
                            api={api}
                            title="DCP"
                            eyebrow="DCP"
                            message="No session selected. Open a session and run /dcp-panel again."
                            onBack={() => api.route.navigate("session", {})}
                        />
                    )
                }
                return (
                    <PanelPage
                        api={api}
                        config={config}
                        sessionID={params.sessionID}
                        data={params.data}
                    />
                )
            },
        },
    ])
}
