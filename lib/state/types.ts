import type { CompressionTimingState } from "../compress/timing"

export type ToolStatus = "pending" | "running" | "completed" | "error"

/**
 * DCP's internal message model. It is deliberately shaped like the historical
 * `{ info, parts }` view so the compression/pruning pipeline can operate on a
 * single normalized representation, but it is sourced natively from OpenCode v2
 * (`SessionMessage.Info` plus the model-request `Message` projection).
 */

export interface DcpToolState {
    status: ToolStatus
    input?: any
    output?: any
    error?: any
    metadata?: Record<string, any>
    time?: { start?: number; end?: number; compacted?: number }
}

export interface DcpToolPart {
    type: "tool"
    callID: string
    tool: string
    state: DcpToolState
}

export interface DcpTextPart {
    type: "text"
    text: string
    synthetic?: boolean
    ignored?: boolean
    id?: string
    sessionID?: string
    messageID?: string
}

export interface DcpReasoningPart {
    type: "reasoning"
    text: string
}

export interface DcpStepStartPart {
    type: "step-start"
    snapshot?: string
}

export interface DcpStepFinishPart {
    type: "step-finish"
    tokens?: unknown
}

export interface DcpFilePart {
    type: "file"
    [key: string]: any
}

export type DcpPart =
    | DcpToolPart
    | DcpTextPart
    | DcpReasoningPart
    | DcpStepStartPart
    | DcpStepFinishPart
    | DcpFilePart

export interface DcpModelRef {
    providerID?: string
    modelID?: string
    variant?: string
}

export interface DcpTokenUsage {
    input?: number
    output?: number
    reasoning?: number
    cache?: { read?: number; write?: number }
}

export interface DcpMessageInfo {
    id: string
    sessionID: string
    role: "user" | "assistant"
    agent?: string
    model?: DcpModelRef
    modelID?: string
    providerID?: string
    variant?: string
    tokens?: DcpTokenUsage
    summary?: boolean
    time: { created: number }
}

export interface WithParts {
    info: DcpMessageInfo
    parts: DcpPart[]
}

export interface ToolParameterEntry {
    tool: string
    parameters: any
    status?: ToolStatus
    error?: string
    turn: number
    tokenCount?: number
}

export interface SessionStats {
    pruneTokenCounter: number
    totalPruneTokens: number
}

export interface PrunedMessageEntry {
    tokenCount: number
    allBlockIds: number[]
    activeBlockIds: number[]
}

export type CompressionMode = "range" | "message"

export interface CompressionBlock {
    blockId: number
    runId: number
    active: boolean
    deactivatedByUser: boolean
    compressedTokens: number
    summaryTokens: number
    durationMs: number
    mode?: CompressionMode
    topic: string
    batchTopic?: string
    startId: string
    endId: string
    anchorMessageId: string
    compressMessageId: string
    compressCallId?: string
    includedBlockIds: number[]
    consumedBlockIds: number[]
    parentBlockIds: number[]
    directMessageIds: string[]
    directToolIds: string[]
    effectiveMessageIds: string[]
    effectiveToolIds: string[]
    createdAt: number
    deactivatedAt?: number
    deactivatedByBlockId?: number
    summary: string
}

export interface PruneMessagesState {
    byMessageId: Map<string, PrunedMessageEntry>
    blocksById: Map<number, CompressionBlock>
    activeBlockIds: Set<number>
    activeByAnchorMessageId: Map<string, number>
    nextBlockId: number
    nextRunId: number
}

export interface Prune {
    tools: Map<string, number>
    messages: PruneMessagesState
}

export interface PendingManualTrigger {
    sessionId: string
    prompt: string
}

export interface MessageIdState {
    byRawId: Map<string, string>
    byRef: Map<string, string>
    nextRef: number
}

export interface Nudges {
    contextLimitAnchors: Set<string>
    turnNudgeAnchors: Set<string>
    iterationNudgeAnchors: Set<string>
}

export interface SessionState {
    sessionId: string | null
    isSubAgent: boolean
    manualMode: false | "active" | "compress-pending"
    compressPermission: "ask" | "allow" | "deny" | undefined
    pendingManualTrigger: PendingManualTrigger | null
    prune: Prune
    nudges: Nudges
    stats: SessionStats
    compressionTiming: CompressionTimingState
    toolParameters: Map<string, ToolParameterEntry>
    subAgentResultCache: Map<string, string>
    toolIdList: string[]
    messageIds: MessageIdState
    lastCompaction: number
    currentTurn: number
    modelContextLimit: number | undefined
    systemPromptTokens: number | undefined
    persistedUpdatedAt?: string
}
