/** @jsxImportSource @opentui/solid */

import {
    getActiveCompressionTargets,
    type CompressionTarget,
} from "../commands/compression-targets"
import { compressPermission } from "../compress-permission"
import { analyzeContextTokens } from "../commands/context"
import { formatHelpMessage } from "../commands/help"
import type { PluginConfig } from "../config"
import type { SessionState, WithParts } from "../state"
import { getActiveSummaryTokenUsage } from "../state/utils"
import { findOldestUncompressedSpan, getCurrentTokenUsage } from "../token-utils"
import { formatTokenCount, truncate } from "../ui/utils"
import { TextAttributes } from "@opentui/core"
import { buildContextMap, type ContextMapEntry } from "./context-map"
import { formatDuration, formatRatio } from "./format"
import { ActionRow, Card, DcpFrame, Metric, Progress, StatusPill } from "./ui"
import type { StatsReport, Theme, TuiApi } from "./types"

export function StatusDialog(props: {
    api: TuiApi
    title: string
    eyebrow: string
    message: string
    onBack?: () => void
}) {
    return (
        <DcpFrame api={props.api} title={props.title} eyebrow={props.eyebrow} onBack={props.onBack}>
            <box paddingTop={1} paddingBottom={1}>
                <text fg={props.api.theme.current.textMuted}>{props.message}</text>
            </box>
        </DcpFrame>
    )
}

export function HelpDialog(props: {
    api: TuiApi
    state: SessionState
    config: PluginConfig
    onBack: () => void
}) {
    const theme = props.api.theme.current
    const message = formatHelpMessage(props.state, props.config)
    return (
        <DcpFrame api={props.api} title="Help" eyebrow="DCP" onBack={props.onBack}>
            <Card theme={theme} title="Commands">
                <scrollbox height={14} scrollY={true}>
                    <text fg={theme.text}>{message}</text>
                </scrollbox>
            </Card>
        </DcpFrame>
    )
}

export function ContextDialog(props: {
    api: TuiApi
    state: SessionState
    messages: WithParts[]
    onBack: () => void
}) {
    const theme = props.api.theme.current
    const breakdown = analyzeContextTokens(props.state, props.messages)
    const total = Math.max(0, breakdown.total)
    const scale = Math.max(
        1,
        total,
        breakdown.system,
        breakdown.user,
        breakdown.assistant,
        breakdown.tools,
    )
    const activePruned = breakdown.prunedToolCount + breakdown.prunedMessageCount

    return (
        <DcpFrame api={props.api} title="Context" eyebrow="DCP" onBack={props.onBack}>
            <box flexDirection="row" gap={2} flexWrap="wrap">
                <box flexGrow={1} flexBasis={40}>
                    <Card theme={theme} title="Current">
                        <Metric
                            theme={theme}
                            label="Total in context"
                            value={`~${formatTokenCount(total, true)}`}
                            hint="tokens"
                        />
                        <Metric
                            theme={theme}
                            label="Tools in context"
                            value={`${breakdown.toolsInContextCount}`}
                        />
                        <Metric
                            theme={theme}
                            label="Active pruned targets"
                            value={`${activePruned}`}
                        />
                        <Metric
                            theme={theme}
                            label="Tokens pruned"
                            value={`~${formatTokenCount(breakdown.prunedTokens, true)}`}
                            hint="tokens"
                        />
                    </Card>
                </box>
                <box flexGrow={1} flexBasis={40}>
                    <Card theme={theme} title="Breakdown">
                        <Progress
                            theme={theme}
                            label="System"
                            value={breakdown.system}
                            total={scale}
                            color="primary"
                            detail={`~${formatTokenCount(breakdown.system, true)} tokens`}
                        />
                        <Progress
                            theme={theme}
                            label="Assistant"
                            value={breakdown.assistant}
                            total={scale}
                            color="primary"
                            detail={`~${formatTokenCount(breakdown.assistant, true)} tokens`}
                        />
                        <Progress
                            theme={theme}
                            label="User"
                            value={breakdown.user}
                            total={scale}
                            color="primary"
                            detail={`~${formatTokenCount(breakdown.user, true)} tokens`}
                        />
                        <Progress
                            theme={theme}
                            label={`Tools (${breakdown.toolsInContextCount})`}
                            value={breakdown.tools}
                            total={scale}
                            color="primary"
                            detail={`~${formatTokenCount(breakdown.tools, true)} tokens`}
                        />
                    </Card>
                </box>
            </box>
        </DcpFrame>
    )
}

export function StatsDialog(props: { api: TuiApi; report: StatsReport; onBack: () => void }) {
    const theme = props.api.theme.current
    const ratio = formatRatio(props.report.sessionTokens, props.report.sessionSummaryTokens)
    return (
        <DcpFrame api={props.api} title="Stats" eyebrow="DCP" onBack={props.onBack}>
            <box flexDirection="row" gap={2} flexWrap="wrap">
                <box flexGrow={1} flexBasis={40}>
                    <Card theme={theme} title="Session">
                        <Metric
                            theme={theme}
                            label="Tokens saved"
                            value={`~${formatTokenCount(props.report.sessionTokens, true)}`}
                            hint="tokens"
                        />
                        <Metric
                            theme={theme}
                            label="Summary size"
                            value={`~${formatTokenCount(props.report.sessionSummaryTokens, true)}`}
                            hint="tokens"
                        />
                        <Metric theme={theme} label="Compression ratio" value={ratio} />
                        <Metric
                            theme={theme}
                            label="Compression time"
                            value={formatDuration(props.report.sessionDurationMs)}
                        />
                        <Metric
                            theme={theme}
                            label="Tools pruned"
                            value={`${props.report.sessionTools}`}
                        />
                        <Metric
                            theme={theme}
                            label="Messages pruned"
                            value={`${props.report.sessionMessages}`}
                        />
                    </Card>
                </box>
                <box flexGrow={1} flexBasis={40}>
                    <Card theme={theme} title="All time">
                        <Metric
                            theme={theme}
                            label="Tokens saved"
                            value={`~${formatTokenCount(props.report.allTime.totalTokens, true)}`}
                            hint="tokens"
                        />
                        <Metric
                            theme={theme}
                            label="Tools pruned"
                            value={`${props.report.allTime.totalTools}`}
                        />
                        <Metric
                            theme={theme}
                            label="Messages pruned"
                            value={`${props.report.allTime.totalMessages}`}
                        />
                        <Metric
                            theme={theme}
                            label="Sessions with DCP history"
                            value={`${props.report.allTime.sessionCount}`}
                        />
                    </Card>
                </box>
            </box>
        </DcpFrame>
    )
}

export function ContextMapDialog(props: {
    api: TuiApi
    state: SessionState
    messages: WithParts[]
    onBack: () => void
}) {
    const theme = props.api.theme.current
    const entries = buildContextMap(props.state, props.messages)
    return (
        <DcpFrame api={props.api} title="Context map" eyebrow="DCP" onBack={props.onBack}>
            <Card theme={theme} title={`Timeline front to back (${entries.length} entries)`}>
                {entries.length === 0 ? (
                    <text fg={theme.textMuted}>No messages in this session.</text>
                ) : (
                    <scrollbox height={18} scrollY={true}>
                        {entries.map((entry) => (
                            <MapRow theme={theme} entry={entry} />
                        ))}
                    </scrollbox>
                )}
            </Card>
        </DcpFrame>
    )
}

function MapRow(props: { theme: Theme; entry: ContextMapEntry }) {
    const entry = props.entry
    if (entry.kind === "compressed") {
        const topic = (entry.topic || "(no topic)").replace(/\s+/g, " ").trim()
        const range =
            entry.startRef === entry.endRef ? entry.startRef : `${entry.startRef}..${entry.endRef}`
        return (
            <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
                <box width={3}>
                    <text fg={props.theme.accent} attributes={TextAttributes.BOLD}>
                        {"▣"}
                    </text>
                </box>
                <box width={6}>
                    <text fg={props.theme.primary} attributes={TextAttributes.BOLD}>
                        {`b${entry.blockId}`}
                    </text>
                </box>
                <box width={7}>
                    <text fg={props.theme.textMuted}>{`${entry.messageCount} msg`}</text>
                </box>
                <box width={19}>
                    <text fg={props.theme.textMuted}>{range}</text>
                </box>
                <box width={14}>
                    <text
                        fg={props.theme.textMuted}
                    >{`~${formatTokenCount(entry.compressedTokens, true)}→${formatTokenCount(entry.summaryTokens, true)}`}</text>
                </box>
                <box flexGrow={1}>
                    <text fg={props.theme.text}>{truncate(topic, 40)}</text>
                </box>
            </box>
        )
    }

    const role = entry.role === "user" ? "user" : "asst"
    return (
        <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1}>
            <box width={3}>
                <text fg={props.theme.textMuted}>{"·"}</text>
            </box>
            <box width={6}>
                <text fg={props.theme.textMuted}>{entry.ref}</text>
            </box>
            <box width={7}>
                <text fg={entry.role === "user" ? props.theme.info : props.theme.textMuted}>
                    {role}
                </text>
            </box>
            <box width={19}>
                <text fg={props.theme.textMuted}>{""}</text>
            </box>
            <box width={14}>
                <text fg={props.theme.textMuted}>{""}</text>
            </box>
            <box flexGrow={1}>
                <text fg={props.theme.textMuted}>{entry.preview}</text>
            </box>
        </box>
    )
}

export function PanelDialog(props: {
    api: TuiApi
    state: SessionState
    messages: WithParts[]
    config: PluginConfig
    onContext: () => void
    onContextMap: () => void
    onStats: () => void
    onManual: (enabled: boolean) => void
    onSweep: () => void
    onDecompress: () => void
    onRecompress: () => void
    onCompress: () => void
    onDecompressBlock: (blockId: number) => void
    onHelp: () => void
}) {
    const theme = props.api.theme.current
    const canCompress = compressPermission(props.state, props.config) !== "deny"
    const manualEnabled = !!props.state.manualMode
    const targets = getActiveCompressionTargets(props.state.prune.messages)
    let removedTokens = 0
    for (const target of targets) {
        removedTokens += target.compressedTokens
    }
    const summaryTokens = getActiveSummaryTokenUsage(props.state)
    const netSaved = removedTokens - summaryTokens
    const backlog = findOldestUncompressedSpan(props.state, props.messages)
    const currentTokens = getCurrentTokenUsage(props.state, props.messages)

    return (
        <DcpFrame api={props.api} eyebrow="DCP" title="Compression Panel">
            <box flexDirection="row" gap={2} flexGrow={1}>
                <box flexDirection="column" gap={1} flexGrow={1}>
                    <Card theme={theme} title="Summary">
                        <Metric
                            theme={theme}
                            label="Active blocks"
                            value={String(targets.length)}
                        />
                        <Metric
                            theme={theme}
                            label="Removed (active)"
                            value={`~${formatTokenCount(removedTokens, true)}`}
                            hint="tokens"
                        />
                        <Metric
                            theme={theme}
                            label="Summaries (active)"
                            value={`~${formatTokenCount(summaryTokens, true)}`}
                            hint="tokens"
                        />
                        <Metric
                            theme={theme}
                            label="Net saved"
                            value={`${netSaved >= 0 ? "-" : "+"}${formatTokenCount(Math.abs(netSaved), true)}`}
                            hint="tokens"
                        />
                        <Metric
                            theme={theme}
                            label="Current context"
                            value={`~${formatTokenCount(currentTokens, true)}`}
                            hint="tokens"
                        />
                        <Metric
                            theme={theme}
                            label="Uncompressed backlog"
                            value={backlog ? `~${formatTokenCount(backlog.tokens, true)}` : "none"}
                            hint={
                                backlog
                                    ? `${backlog.startRef}..${backlog.endRef} (${backlog.messageCount} msgs)`
                                    : "tokens"
                            }
                        />
                    </Card>
                    <Card
                        theme={theme}
                        title={`Active compressions (${targets.length}) - click to restore`}
                    >
                        {targets.length === 0 ? (
                            <text fg={theme.textMuted}>No active compressions.</text>
                        ) : (
                            <scrollbox height={8} scrollY={true}>
                                {targets.map((target) => (
                                    <BlockRow
                                        theme={theme}
                                        target={target}
                                        onSelect={props.onDecompressBlock}
                                    />
                                ))}
                            </scrollbox>
                        )}
                    </Card>
                </box>
                <box flexDirection="column" gap={1} width={40}>
                    <Card theme={theme} title="Actions">
                        <box flexDirection="column" gap={0}>
                            <ActionRow
                                theme={theme}
                                title="Context"
                                detail="Tokens"
                                onClick={props.onContext}
                            />
                            <ActionRow
                                theme={theme}
                                title="Map"
                                detail="Timeline"
                                onClick={props.onContextMap}
                            />
                            <ActionRow
                                theme={theme}
                                title="Stats"
                                detail="Savings"
                                onClick={props.onStats}
                            />
                            <ActionRow
                                theme={theme}
                                title="Sweep"
                                detail="Prune tools"
                                onClick={props.onSweep}
                            />
                            {canCompress ? (
                                <ActionRow
                                    theme={theme}
                                    title="Decompress"
                                    detail="Restore block"
                                    onClick={props.onDecompress}
                                />
                            ) : null}
                            {canCompress ? (
                                <ActionRow
                                    theme={theme}
                                    title="Recompress"
                                    detail="Re-apply block"
                                    onClick={props.onRecompress}
                                />
                            ) : null}
                            {canCompress ? (
                                <ActionRow
                                    theme={theme}
                                    title="Compress"
                                    detail="Compress now"
                                    onClick={props.onCompress}
                                />
                            ) : null}
                            <ActionRow
                                theme={theme}
                                title="Help"
                                detail="Commands"
                                onClick={props.onHelp}
                            />
                        </box>
                    </Card>
                    <Card theme={theme} title="Session">
                        <ManualModeToggle
                            api={props.api}
                            state={props.state}
                            onToggle={props.onManual}
                        />
                        <StatusPill
                            theme={theme}
                            label="Compression command"
                            value={canCompress ? "enabled" : "disabled"}
                            accent={canCompress ? "success" : "warning"}
                        />
                    </Card>
                </box>
            </box>
        </DcpFrame>
    )
}

function BlockRow(props: {
    theme: Theme
    target: CompressionTarget
    onSelect: (blockId: number) => void
}) {
    const target = props.target
    const topic = (target.topic || "(no topic)").replace(/\s+/g, " ").trim()
    const runLabel = target.grouped
        ? `#${target.runId} x${target.blocks.length}`
        : `#${target.runId}`
    return (
        <box
            flexDirection="row"
            gap={1}
            paddingLeft={1}
            paddingRight={1}
            onMouseUp={() => props.onSelect(target.displayId)}
        >
            <box width={5}>
                <text fg={props.theme.primary} attributes={TextAttributes.BOLD}>
                    {`b${target.displayId}`}
                </text>
            </box>
            <box width={8}>
                <text
                    fg={props.theme.textMuted}
                >{`~${formatTokenCount(target.compressedTokens, true)}`}</text>
            </box>
            <box width={9}>
                <text fg={props.theme.textMuted}>{runLabel}</text>
            </box>
            <box flexGrow={1}>
                <text fg={props.theme.text}>{truncate(topic, 48)}</text>
            </box>
        </box>
    )
}

function ManualModeToggle(props: {
    api: TuiApi
    state: SessionState
    onToggle: (enabled: boolean) => void
}) {
    const theme = props.api.theme.current
    const enabled = !!props.state.manualMode
    const track = enabled ? theme.success : theme.error
    return (
        <box flexDirection="row" justifyContent="space-between" paddingLeft={1} paddingRight={1}>
            <box width={22}>
                <text fg={theme.primary} attributes={TextAttributes.BOLD}>
                    Manual mode
                </text>
            </box>
            <box
                backgroundColor={track}
                paddingLeft={1}
                paddingRight={1}
                onMouseUp={() => props.onToggle(!enabled)}
            >
                <text fg={theme.background}>{enabled ? "   ■" : "■   "}</text>
            </box>
        </box>
    )
}
