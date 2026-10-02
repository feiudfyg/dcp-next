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
import { formatTokenCount } from "../ui/utils"
import { TextAttributes } from "@opentui/core"
import { buildContextMap, type ContextMapEntry } from "./context-map"
import { formatDuration, formatRatio } from "./format"
import { ActionButton, ActionRow, Card, DcpFrame, Metric, Progress, StatusPill } from "./ui"
import type { StatsReport, Theme, TuiApi } from "./types"

function isWide(api: TuiApi): boolean {
    return (api.renderer?.terminalWidth ?? 0) >= 128
}

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
                <text fg={props.api.theme.current.textMuted} wrapMode="word">
                    {props.message}
                </text>
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
                    <text fg={theme.text} wrapMode="word">
                        {message}
                    </text>
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

    const currentCard = (
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
            <Metric theme={theme} label="Active pruned targets" value={`${activePruned}`} />
            <Metric
                theme={theme}
                label="Tokens pruned"
                value={`~${formatTokenCount(breakdown.prunedTokens, true)}`}
                hint="tokens"
            />
        </Card>
    )
    const breakdownCard = (
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
    )

    return (
        <DcpFrame api={props.api} title="Context" eyebrow="DCP" onBack={props.onBack}>
            {isWide(props.api) ? (
                <box flexDirection="row" gap={2} width="100%">
                    <box flexGrow={1} flexShrink={1}>
                        {currentCard}
                    </box>
                    <box flexGrow={1} flexShrink={1}>
                        {breakdownCard}
                    </box>
                </box>
            ) : (
                <box flexDirection="column" gap={1} width="100%">
                    {currentCard}
                    {breakdownCard}
                </box>
            )}
        </DcpFrame>
    )
}

export function StatsDialog(props: { api: TuiApi; report: StatsReport; onBack: () => void }) {
    const theme = props.api.theme.current
    const ratio = formatRatio(props.report.sessionTokens, props.report.sessionSummaryTokens)

    const sessionCard = (
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
            <Metric theme={theme} label="Tools pruned" value={`${props.report.sessionTools}`} />
            <Metric
                theme={theme}
                label="Messages pruned"
                value={`${props.report.sessionMessages}`}
            />
        </Card>
    )
    const allTimeCard = (
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
    )

    return (
        <DcpFrame api={props.api} title="Stats" eyebrow="DCP" onBack={props.onBack}>
            {isWide(props.api) ? (
                <box flexDirection="row" gap={2} width="100%">
                    <box flexGrow={1} flexShrink={1}>
                        {sessionCard}
                    </box>
                    <box flexGrow={1} flexShrink={1}>
                        {allTimeCard}
                    </box>
                </box>
            ) : (
                <box flexDirection="column" gap={1} width="100%">
                    {sessionCard}
                    {allTimeCard}
                </box>
            )}
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
            <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1} width="100%">
                <box width={2} flexShrink={0}>
                    <text fg={props.theme.accent} attributes={TextAttributes.BOLD}>
                        {"▣"}
                    </text>
                </box>
                <box width={6} flexShrink={0}>
                    <text fg={props.theme.primary} attributes={TextAttributes.BOLD} truncate>
                        {`b${entry.blockId}`}
                    </text>
                </box>
                <box width={6} flexShrink={0}>
                    <text fg={props.theme.textMuted} truncate>{`${entry.messageCount} msg`}</text>
                </box>
                <box width={12} flexShrink={0}>
                    <text fg={props.theme.textMuted} truncate>
                        {range}
                    </text>
                </box>
                <box width={11} flexShrink={0}>
                    <text fg={props.theme.textMuted} truncate>
                        {`~${formatTokenCount(entry.compressedTokens, true)}→${formatTokenCount(entry.summaryTokens, true)}`}
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

    const role = entry.role === "user" ? "user" : "asst"
    return (
        <box flexDirection="row" gap={1} paddingLeft={1} paddingRight={1} width="100%">
            <box width={2} flexShrink={0}>
                <text fg={props.theme.textMuted}>{"·"}</text>
            </box>
            <box width={6} flexShrink={0}>
                <text fg={props.theme.textMuted} truncate>
                    {entry.ref}
                </text>
            </box>
            <box width={6} flexShrink={0}>
                <text
                    fg={entry.role === "user" ? props.theme.info : props.theme.textMuted}
                    truncate
                >
                    {role}
                </text>
            </box>
            <box width={12} flexShrink={0} />
            <box width={11} flexShrink={0} />
            <box flexGrow={1} flexShrink={1}>
                <text fg={props.theme.textMuted} truncate>
                    {entry.preview}
                </text>
            </box>
        </box>
    )
}

export interface PanelBodyProps {
    api: TuiApi
    state: SessionState
    messages: WithParts[]
    config: PluginConfig
    wide: boolean
    scrollHeight: number
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
}

export function PanelBody(props: PanelBodyProps) {
    const theme = props.api.theme.current
    const wide = props.wide
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

    const summaryBlock = (
        <box flexDirection="column" width="100%">
            <text fg={theme.text} wrapMode="word">
                {`Blocks ${targets.length}  ·  Removed ~${formatTokenCount(removedTokens, true)}  ·  Summaries ~${formatTokenCount(summaryTokens, true)}  ·  Net ${netSaved >= 0 ? "-" : "+"}${formatTokenCount(Math.abs(netSaved), true)}`}
            </text>
            <text fg={theme.textMuted} wrapMode="word">
                {`Context ~${formatTokenCount(currentTokens, true)}${backlog ? `  ·  Backlog ${backlog.startRef}..${backlog.endRef} (${backlog.messageCount} msgs, ~${formatTokenCount(backlog.tokens, true)})` : ""}`}
            </text>
        </box>
    )

    const blocksCard = (
        <Card theme={theme} title={`Active compressions (${targets.length}) - click to restore`}>
            {targets.length === 0 ? (
                <text fg={theme.textMuted}>No active compressions.</text>
            ) : (
                <scrollbox height={props.scrollHeight} scrollY={true}>
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
    )

    const manualButton = (
        <ActionButton
            theme={theme}
            label={manualEnabled ? "Manual: on" : "Manual: off"}
            variant={manualEnabled ? "primary" : "muted"}
            onClick={() => props.onManual(!manualEnabled)}
        />
    )

    if (wide) {
        return (
            <box flexDirection="row" gap={2} flexGrow={1} width="100%">
                <box flexDirection="column" gap={1} flexGrow={1} flexShrink={1}>
                    {summaryBlock}
                    {blocksCard}
                </box>
                <box flexDirection="column" gap={1} width={36} flexShrink={0}>
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
                                detail="Prune"
                                onClick={props.onSweep}
                            />
                            {canCompress ? (
                                <ActionRow
                                    theme={theme}
                                    title="Decompress"
                                    detail="Restore"
                                    onClick={props.onDecompress}
                                />
                            ) : null}
                            {canCompress ? (
                                <ActionRow
                                    theme={theme}
                                    title="Recompress"
                                    detail="Re-apply"
                                    onClick={props.onRecompress}
                                />
                            ) : null}
                            {canCompress ? (
                                <ActionRow
                                    theme={theme}
                                    title="Compress"
                                    detail="Now"
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
                            label="Compression"
                            value={canCompress ? "enabled" : "disabled"}
                            accent={canCompress ? "success" : "warning"}
                        />
                    </Card>
                </box>
            </box>
        )
    }

    return (
        <box flexDirection="column" gap={1} width="100%">
            {summaryBlock}
            {blocksCard}
            <box flexDirection="row" gap={1} flexWrap="wrap">
                <ActionButton theme={theme} label="Context" onClick={props.onContext} />
                <ActionButton theme={theme} label="Map" onClick={props.onContextMap} />
                <ActionButton theme={theme} label="Stats" onClick={props.onStats} />
                <ActionButton theme={theme} label="Sweep" onClick={props.onSweep} />
                {canCompress ? (
                    <ActionButton theme={theme} label="Decompress" onClick={props.onDecompress} />
                ) : null}
                {canCompress ? (
                    <ActionButton theme={theme} label="Recompress" onClick={props.onRecompress} />
                ) : null}
                {canCompress ? (
                    <ActionButton
                        theme={theme}
                        label="Compress"
                        variant="primary"
                        onClick={props.onCompress}
                    />
                ) : null}
                {manualButton}
                <ActionButton theme={theme} label="Help" onClick={props.onHelp} />
            </box>
        </box>
    )
}

export function PanelDialog(props: Omit<PanelBodyProps, "wide" | "scrollHeight">) {
    const wide = isWide(props.api)
    return (
        <DcpFrame api={props.api} eyebrow="DCP" title="Compression Panel">
            <PanelBody {...props} wide={wide} scrollHeight={wide ? 14 : 10} />
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
            width="100%"
            onMouseUp={() => props.onSelect(target.displayId)}
        >
            <box width={5} flexShrink={0}>
                <text fg={props.theme.primary} attributes={TextAttributes.BOLD} truncate>
                    {`b${target.displayId}`}
                </text>
            </box>
            <box width={8} flexShrink={0}>
                <text
                    fg={props.theme.textMuted}
                    truncate
                >{`~${formatTokenCount(target.compressedTokens, true)}`}</text>
            </box>
            <box width={9} flexShrink={0}>
                <text fg={props.theme.textMuted} truncate>
                    {runLabel}
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
            <box width={20} flexShrink={0}>
                <text fg={theme.primary} attributes={TextAttributes.BOLD} truncate>
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
