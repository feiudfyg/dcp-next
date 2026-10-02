import { SessionState, WithParts } from "./state"
import { AssistantMessage, UserMessage } from "@opencode-ai/sdk/v2"
import { Logger } from "./logger"
import * as _anthropicTokenizer from "@anthropic-ai/tokenizer"
const anthropicCountTokens = (_anthropicTokenizer.countTokens ??
    (_anthropicTokenizer as any).default?.countTokens) as typeof _anthropicTokenizer.countTokens
import { getLastUserMessage } from "./messages/query"

export function getCurrentTokenUsage(state: SessionState, messages: WithParts[]): number {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i]
        if (msg.info.role !== "assistant") {
            continue
        }

        const assistantInfo = msg.info as AssistantMessage
        if ((assistantInfo.tokens?.output || 0) <= 0) {
            continue
        }

        if (
            state.lastCompaction > 0 &&
            (msg.info.time.created < state.lastCompaction ||
                (msg.info.summary === true && msg.info.time.created === state.lastCompaction))
        ) {
            return 0
        }

        const input = assistantInfo.tokens?.input || 0
        const output = assistantInfo.tokens?.output || 0
        const reasoning = assistantInfo.tokens?.reasoning || 0
        const cacheRead = assistantInfo.tokens?.cache?.read || 0
        const cacheWrite = assistantInfo.tokens?.cache?.write || 0
        return input + output + reasoning + cacheRead + cacheWrite
    }

    return 0
}

export function getCurrentParams(
    state: SessionState,
    messages: WithParts[],
    logger: Logger,
): {
    providerId: string | undefined
    modelId: string | undefined
    agent: string | undefined
    variant: string | undefined
} {
    const userMsg = getLastUserMessage(messages)
    if (!userMsg) {
        logger.debug("No user message found when determining current params")
        return {
            providerId: undefined,
            modelId: undefined,
            agent: undefined,
            variant: undefined,
        }
    }
    const userInfo = userMsg.info as UserMessage
    const agent: string = userInfo.agent
    const providerId: string | undefined = userInfo.model.providerID
    const modelId: string | undefined = userInfo.model.modelID
    const variant: string | undefined = userInfo.model.variant

    return { providerId, modelId, agent, variant }
}

export function countTokens(text: string): number {
    if (!text) return 0
    try {
        return anthropicCountTokens(text)
    } catch {
        return Math.round(text.length / 4)
    }
}

export function estimateTokensBatch(texts: string[]): number {
    if (texts.length === 0) return 0
    return countTokens(texts.join(" "))
}

export const COMPACTED_TOOL_OUTPUT_PLACEHOLDER = "[Old tool result content cleared]"

function stringifyToolContent(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value)
}

export function extractCompletedToolOutput(part: any): string | undefined {
    if (
        part?.type !== "tool" ||
        part.state?.status !== "completed" ||
        part.state?.output === undefined
    ) {
        return undefined
    }

    if (part.state?.time?.compacted) {
        return COMPACTED_TOOL_OUTPUT_PLACEHOLDER
    }

    return stringifyToolContent(part.state.output)
}

export function extractToolContent(part: any): string[] {
    const contents: string[] = []

    if (part?.type !== "tool") {
        return contents
    }

    if (part.state?.input !== undefined) {
        contents.push(stringifyToolContent(part.state.input))
    }

    const completedOutput = extractCompletedToolOutput(part)
    if (completedOutput !== undefined) {
        contents.push(completedOutput)
    } else if (part.state?.status === "error" && part.state?.error) {
        contents.push(stringifyToolContent(part.state.error))
    }

    return contents
}

export function countToolTokens(part: any): number {
    const contents = extractToolContent(part)
    return estimateTokensBatch(contents)
}

export function getTotalToolTokens(state: SessionState, toolIds: string[]): number {
    let total = 0
    for (const id of toolIds) {
        const entry = state.toolParameters.get(id)
        total += entry?.tokenCount ?? 0
    }
    return total
}

export function countAllMessageTokens(msg: WithParts): number {
    const parts = Array.isArray(msg.parts) ? msg.parts : []
    const texts: string[] = []
    for (const part of parts) {
        if (part.type === "text") {
            texts.push(part.text)
        } else {
            texts.push(...extractToolContent(part))
        }
    }
    if (texts.length === 0) return 0
    return estimateTokensBatch(texts)
}

export interface UncompressedSpan {
    startRef: string
    endRef: string
    messageCount: number
    tokens: number
}

function formatMessageRef(index: number): string {
    return `m${String(index).padStart(4, "0")}`
}

function buildSpan(
    start: number,
    end: number,
    messageCount: number,
    tokens: number,
): UncompressedSpan {
    return {
        startRef: formatMessageRef(start),
        endRef: formatMessageRef(end),
        messageCount,
        tokens,
    }
}

export function findOldestUncompressedSpan(
    state: SessionState,
    messages: WithParts[],
    minMessages = 20,
    minTokens = 20000,
): UncompressedSpan | null {
    const entries: Array<{ position: number; message: WithParts }> = []
    for (const message of messages) {
        const pruneEntry = state.prune.messages.byMessageId.get(message.info.id)
        if (pruneEntry && pruneEntry.activeBlockIds.length > 0) {
            continue
        }

        const ref = state.messageIds.byRawId.get(message.info.id)
        if (!ref) {
            continue
        }

        const position = Number.parseInt(ref.slice(1), 10)
        if (!Number.isInteger(position)) {
            continue
        }

        entries.push({ position, message })
    }

    if (entries.length === 0) {
        return null
    }

    entries.sort((left, right) => left.position - right.position)

    let runStart = 0
    let runEnd = 0
    let runCount = 0
    let runTokens = 0
    let previous = Number.NaN

    const qualifies = (): boolean => runCount >= minMessages || runTokens >= minTokens

    for (const entry of entries) {
        if (runCount === 0 || entry.position !== previous + 1) {
            if (runCount > 0 && qualifies()) {
                return buildSpan(runStart, runEnd, runCount, runTokens)
            }
            runStart = entry.position
            runCount = 0
            runTokens = 0
        }

        runEnd = entry.position
        runCount++
        runTokens += countAllMessageTokens(entry.message)
        previous = entry.position
    }

    if (runCount > 0 && qualifies()) {
        return buildSpan(runStart, runEnd, runCount, runTokens)
    }

    return null
}
