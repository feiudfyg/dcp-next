/** @jsxImportSource @opentui/solid */

import { TextAttributes } from "@opentui/core"
import {
    getActiveCompressionTargets,
    getRecompressibleCompressionTargets,
    type CompressionTarget,
} from "../commands/compression-targets"
import { handleDecompressCommand } from "../commands/decompress"
import { handleRecompressCommand } from "../commands/recompress"
import { handleSweepCommand } from "../commands/sweep"
import type { PluginConfig } from "../config"
import { saveManualModeSetting } from "../state/persistence"
import { formatTokenCount } from "../ui/utils"
import { logger, type SessionData } from "./data"
import {
    ContextDialog,
    ContextMapDialog,
    HelpDialog,
    PanelBody,
    StatsDialog,
    StatusDialog,
} from "./dialogs"
import { PANEL_ROUTE, openPanelRoute } from "./modals"
import { ActionButton, Card, DcpFrame } from "./ui"
import type { StatsReport, Theme, TuiApi } from "./types"

type PanelView =
    | "panel"
    | "context"
    | "stats"
    | "map"
    | "help"
    | "sweep"
    | "decompress"
    | "recompress"
    | "compress"

export interface PanelParams {
    sessionID: string
    data: SessionData
    view?: PanelView
    report?: StatsReport
}

function dialogHeight(api: TuiApi): number {
    return Math.max(20, api.renderer?.terminalHeight ?? 40)
}

function compressionContext(api: TuiApi, config: PluginConfig, data: SessionData, args: string[]) {
    return {
        client: api.client as any,
        state: data.state,
        config,
        logger,
        sessionId: data.state.sessionId as string,
        messages: data.messages,
        args,
    }
}

export function PanelPage(props: { api: TuiApi; config: PluginConfig; params: PanelParams }) {
    const { api, config, params } = props
    const view = params.view ?? "panel"
    const data = params.data
    const back = () => void openPanelRoute(api, config, "panel")

    switch (view) {
        case "context":
            return (
                <ContextDialog
                    api={api}
                    state={data.state}
                    messages={data.messages}
                    onBack={back}
                />
            )
        case "stats":
            return params.report ? (
                <StatsDialog api={api} report={params.report} onBack={back} />
            ) : (
                <StatusDialog
                    api={api}
                    title="Stats"
                    eyebrow="DCP"
                    message="No report."
                    onBack={back}
                />
            )
        case "map":
            return (
                <ContextMapDialog
                    api={api}
                    state={data.state}
                    messages={data.messages}
                    onBack={back}
                />
            )
        case "help":
            return <HelpDialog api={api} state={data.state} config={config} onBack={back} />
        case "sweep":
            return (
                <ConfirmView
                    api={api}
                    title="Sweep"
                    message="Prune tool messages since the last user message now?"
                    confirmLabel="Prune"
                    onCancel={back}
                    onConfirm={() => {
                        void (async () => {
                            await handleSweepCommand({
                                ...compressionContext(api, config, data, []),
                                workingDirectory: api.state.path.directory,
                            })
                            await openPanelRoute(api, config, "panel")
                        })()
                    }}
                />
            )
        case "compress":
            return (
                <ConfirmView
                    api={api}
                    title="Compress"
                    message="Ask the model to run the compress tool now?"
                    confirmLabel="Compress"
                    onCancel={back}
                    onConfirm={() => {
                        void (async () => {
                            await (api.client as any).session.command({
                                sessionID: params.sessionID,
                                command: "dcp-compress",
                                arguments: "",
                            })
                            api.ui.dialog.clear()
                            api.route.navigate("session", { sessionID: params.sessionID })
                        })()
                    }}
                />
            )
        case "decompress":
            return (
                <TargetListView
                    api={api}
                    title="Decompress"
                    empty="No active compressions to restore."
                    targets={getActiveCompressionTargets(data.state.prune.messages)}
                    onBack={back}
                    onPick={(blockId) => {
                        void (async () => {
                            await handleDecompressCommand(
                                compressionContext(api, config, data, [String(blockId)]),
                            )
                            await openPanelRoute(api, config, "panel")
                        })()
                    }}
                />
            )
        case "recompress":
            return (
                <TargetListView
                    api={api}
                    title="Recompress"
                    empty="No decompressed compressions to re-apply."
                    targets={getRecompressibleCompressionTargets(
                        data.state.prune.messages,
                        new Set(data.messages.map((message) => message.info.id)),
                    )}
                    onBack={back}
                    onPick={(blockId) => {
                        void (async () => {
                            await handleRecompressCommand(
                                compressionContext(api, config, data, [String(blockId)]),
                            )
                            await openPanelRoute(api, config, "panel")
                        })()
                    }}
                />
            )
        default:
            return <PanelView api={api} config={config} params={params} />
    }
}

function PanelView(props: { api: TuiApi; config: PluginConfig; params: PanelParams }) {
    const { api, config, params } = props
    const theme = api.theme.current
    const data = params.data
    const scrollHeight = Math.max(8, dialogHeight(api) - 12)
    const toSession = () => api.route.navigate("session", { sessionID: params.sessionID })

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
                    <text fg={theme.textMuted}>{params.sessionID}</text>
                </box>
                <ActionButton
                    theme={theme}
                    label="back to session"
                    variant="primary"
                    onClick={toSession}
                />
            </box>
            <PanelBody
                api={api}
                state={data.state}
                messages={data.messages}
                config={config}
                wide={true}
                scrollHeight={scrollHeight}
                onContext={() => void openPanelRoute(api, config, "context")}
                onContextMap={() => void openPanelRoute(api, config, "map")}
                onStats={() => void openPanelRoute(api, config, "stats")}
                onManual={(enabled) => {
                    void (async () => {
                        await saveManualModeSetting(params.sessionID, enabled, logger)
                        await openPanelRoute(api, config, "panel")
                    })()
                }}
                onSweep={() => void openPanelRoute(api, config, "sweep")}
                onDecompress={() => void openPanelRoute(api, config, "decompress")}
                onRecompress={() => void openPanelRoute(api, config, "recompress")}
                onCompress={() => void openPanelRoute(api, config, "compress")}
                onDecompressBlock={(blockId) => {
                    void (async () => {
                        await handleDecompressCommand(
                            compressionContext(api, config, data, [String(blockId)]),
                        )
                        await openPanelRoute(api, config, "panel")
                    })()
                }}
                onHelp={() => void openPanelRoute(api, config, "help")}
            />
        </box>
    )
}

function ConfirmView(props: {
    api: TuiApi
    title: string
    message: string
    confirmLabel: string
    onConfirm: () => void
    onCancel: () => void
}) {
    const theme = props.api.theme.current
    return (
        <DcpFrame api={props.api} title={props.title} eyebrow="DCP" onBack={props.onCancel}>
            <box paddingTop={1} paddingBottom={1} width="100%">
                <text fg={theme.text} wrapMode="word">
                    {props.message}
                </text>
            </box>
            <box flexDirection="row" gap={1}>
                <ActionButton
                    theme={theme}
                    label={props.confirmLabel}
                    variant="primary"
                    onClick={props.onConfirm}
                />
                <ActionButton theme={theme} label="Cancel" onClick={props.onCancel} />
            </box>
        </DcpFrame>
    )
}

function TargetListView(props: {
    api: TuiApi
    title: string
    empty: string
    targets: CompressionTarget[]
    onPick: (blockId: number) => void
    onBack: () => void
}) {
    const theme = props.api.theme.current
    const scrollHeight = Math.max(6, dialogHeight(props.api) - 10)
    return (
        <DcpFrame api={props.api} title={props.title} eyebrow="DCP" onBack={props.onBack}>
            {props.targets.length === 0 ? (
                <text fg={theme.textMuted} wrapMode="word">
                    {props.empty}
                </text>
            ) : (
                <Card theme={theme} title={`${props.targets.length} targets - click to apply`}>
                    <scrollbox height={scrollHeight} scrollY={true}>
                        {props.targets.map((target) => (
                            <TargetRow theme={theme} target={target} onSelect={props.onPick} />
                        ))}
                    </scrollbox>
                </Card>
            )}
        </DcpFrame>
    )
}

function TargetRow(props: {
    theme: Theme
    target: CompressionTarget
    onSelect: (blockId: number) => void
}) {
    const target = props.target
    const topic = (target.topic || "(no topic)").replace(/\s+/g, " ").trim()
    const detail = target.grouped ? `#${target.runId} x${target.blocks.length}` : `#${target.runId}`
    return (
        <box
            flexDirection="row"
            gap={2}
            width="100%"
            paddingLeft={1}
            paddingRight={1}
            onMouseUp={() => props.onSelect(target.displayId)}
        >
            <box width={5} flexShrink={0}>
                <text fg={props.theme.primary} attributes={TextAttributes.BOLD} truncate>
                    {`b${target.displayId}`}
                </text>
            </box>
            <box width={8} flexShrink={0}>
                <text fg={props.theme.textMuted} truncate>
                    {`~${formatTokenCount(target.compressedTokens, true)}`}
                </text>
            </box>
            <box width={10} flexShrink={0}>
                <text fg={props.theme.textMuted} truncate>
                    {detail}
                </text>
            </box>
            <box flexGrow={1} flexShrink={1}>
                <text fg={props.theme.text} truncate>
                    {topic}
                </text>
            </box>
        </box>
    )
}

export function registerPanelRoute(api: TuiApi, config: PluginConfig) {
    api.route.register([
        {
            name: PANEL_ROUTE,
            render: (input) => {
                const params = (input.params ?? {}) as Partial<PanelParams>
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
                return <PanelPage api={api} config={config} params={params as PanelParams} />
            },
        },
    ])
}
