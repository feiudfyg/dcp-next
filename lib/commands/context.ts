/**
 * DCP Context Command
 * Shows a visual breakdown of token usage in the current session.
 *
 * TOKEN CALCULATION STRATEGY
 * ==========================
 * We minimize tokenizer estimation by leveraging API-reported values wherever possible.
 *
 * WHAT WE GET FROM THE API (exact):
 *   - tokens.input    : Input tokens for each assistant response
 *   - tokens.output   : Output tokens generated (includes text + tool calls)
 *   - tokens.reasoning: Reasoning tokens used
 *   - tokens.cache    : Cache read/write tokens
 *
 * HOW WE CALCULATE EACH CATEGORY:
 *
 *   SYSTEM = total - user - tools - assistant
 *            Calculated as residual: everything in context that is not an
 *            unpruned user message, tool payload, or assistant text part. This is
 *            dominated by the system prompt plus provider-reported overhead.
 *
 *   TOOLS  = tokenizer(toolInputs + toolOutputs) - prunedTokens
 *            We must tokenize tools anyway for pruning decisions.
 *
 *   USER   = tokenizer(all user messages)
 *            User messages are typically small, so estimation is acceptable.
 *
 *   ASSISTANT = tokenizer(all assistant text parts still in context)
 *               Measured directly so assistant output is visible in the breakdown.
 *
 *   TOTAL  = input + output + reasoning + cache.read + cache.write
 *            Matches opencode's UI display.
 *
 * WHY SYSTEM IS THE RESIDUAL:
 *   The API only reports one aggregate context number per request, and the system
 *   prompt is the part we cannot tokenize reliably. Treating it as the residual
 *   keeps every measurable category honest instead of hiding assistant output.
 */

import type { Logger } from "../logger"
import type { SessionState, WithParts } from "../state"
import { sendIgnoredMessage } from "../ui/notification"
import { formatTokenCount } from "../ui/utils"
import { isIgnoredUserMessage } from "../messages/query"
import { isMessageCompacted } from "../state/utils"
import {
    countTokens,
    extractCompletedToolOutput,
    getCurrentParams,
    sumAssistantTokens,
} from "../token-utils"
import type { AssistantMessage, TextPart, ToolPart } from "@opencode-ai/sdk/v2"
import type { SdkClient } from "../sdk-types"

export interface ContextCommandContext {
    client: SdkClient
    state: SessionState
    logger: Logger
    sessionId: string
    messages: WithParts[]
}

interface TokenBreakdown {
    system: number
    user: number
    assistant: number
    tools: number
    toolCount: number
    toolsInContextCount: number
    prunedTokens: number
    prunedToolCount: number
    prunedMessageCount: number
    total: number
}

export function analyzeContextTokens(state: SessionState, messages: WithParts[]): TokenBreakdown {
    const breakdown: TokenBreakdown = {
        system: 0,
        user: 0,
        assistant: 0,
        tools: 0,
        toolCount: 0,
        toolsInContextCount: 0,
        prunedTokens: state.stats.totalPruneTokens,
        prunedToolCount: 0,
        prunedMessageCount: 0,
        total: 0,
    }

    let lastAssistant: AssistantMessage | undefined
    let lastCreated = Number.NEGATIVE_INFINITY
    for (const msg of messages) {
        if (msg.info.role !== "assistant") {
            continue
        }
        const assistantInfo = msg.info as AssistantMessage
        const created = assistantInfo.time?.created ?? 0
        if ((assistantInfo.tokens?.output || 0) > 0 && created > lastCreated) {
            lastAssistant = assistantInfo
            lastCreated = created
        }
    }

    breakdown.total = lastAssistant ? sumAssistantTokens(lastAssistant) : 0

    const userTextParts: string[] = []
    const assistantTextParts: string[] = []
    const toolInputParts: string[] = []
    const toolOutputParts: string[] = []
    const allToolIds = new Set<string>()
    const activeToolIds = new Set<string>()
    const prunedByMessageToolIds = new Set<string>()
    const allMessageIds = new Set<string>()

    for (const msg of messages) {
        allMessageIds.add(msg.info.id)
        const parts = Array.isArray(msg.parts) ? msg.parts : []
        const isCompacted = isMessageCompacted(state, msg)
        const pruneEntry = state.prune.messages.byMessageId.get(msg.info.id)
        const isMessagePruned = !!pruneEntry && pruneEntry.activeBlockIds.length > 0
        const isIgnoredUser = isIgnoredUserMessage(msg)

        for (const part of parts) {
            if (part.type === "tool") {
                const toolPart = part as ToolPart
                if (toolPart.callID) {
                    allToolIds.add(toolPart.callID)
                    if (!isCompacted) {
                        activeToolIds.add(toolPart.callID)
                    }
                    if (isMessagePruned) {
                        prunedByMessageToolIds.add(toolPart.callID)
                    }
                }

                const isPruned = toolPart.callID && state.prune.tools.has(toolPart.callID)
                if (!isCompacted && !isPruned) {
                    if (toolPart.state?.input) {
                        const inputStr =
                            typeof toolPart.state.input === "string"
                                ? toolPart.state.input
                                : JSON.stringify(toolPart.state.input)
                        toolInputParts.push(inputStr)
                    }

                    const outputStr = extractCompletedToolOutput(toolPart)
                    if (outputStr !== undefined) {
                        toolOutputParts.push(outputStr)
                    }
                }
            } else if (
                part.type === "text" &&
                msg.info.role === "user" &&
                !isCompacted &&
                !isIgnoredUser
            ) {
                const textPart = part as TextPart
                userTextParts.push(textPart.text || "")
            } else if (part.type === "text" && msg.info.role === "assistant" && !isCompacted) {
                const textPart = part as TextPart
                assistantTextParts.push(textPart.text || "")
            }
        }
    }

    const prunedByToolIds = new Set<string>()
    for (const id of allToolIds) {
        if (state.prune.tools.has(id)) {
            prunedByToolIds.add(id)
        }
    }

    const prunedToolIds = new Set<string>([...prunedByToolIds, ...prunedByMessageToolIds])
    const toolsInContextCount = [...activeToolIds].filter((id) => !prunedByToolIds.has(id)).length

    let prunedMessageCount = 0
    for (const [id, entry] of state.prune.messages.byMessageId) {
        if (allMessageIds.has(id) && entry.activeBlockIds.length > 0) {
            prunedMessageCount++
        }
    }

    breakdown.toolCount = allToolIds.size
    breakdown.toolsInContextCount = toolsInContextCount
    breakdown.prunedToolCount = prunedToolIds.size
    breakdown.prunedMessageCount = prunedMessageCount

    breakdown.user = countTokens(userTextParts.join("\n"))
    const toolInputTokens = countTokens(toolInputParts.join("\n"))
    const toolOutputTokens = countTokens(toolOutputParts.join("\n"))

    breakdown.tools = toolInputTokens + toolOutputTokens
    breakdown.assistant = countTokens(assistantTextParts.join("\n"))
    breakdown.system = Math.max(
        0,
        breakdown.total - breakdown.user - breakdown.tools - breakdown.assistant,
    )

    return breakdown
}

function createBar(value: number, maxValue: number, width: number, char: string = "█"): string {
    if (maxValue === 0) return ""
    const filled = Math.round((value / maxValue) * width)
    const bar = char.repeat(Math.max(0, filled))
    return bar
}

export function formatContextMessage(breakdown: TokenBreakdown): string {
    const lines: string[] = []
    const barWidth = 30

    const toolsLabel = `Tools (${breakdown.toolsInContextCount})`

    const categories = [
        { label: "System", value: breakdown.system, char: "█" },
        { label: "User", value: breakdown.user, char: "▓" },
        { label: "Assistant", value: breakdown.assistant, char: "▒" },
        { label: toolsLabel, value: breakdown.tools, char: "░" },
    ] as const

    const maxLabelLen = Math.max(...categories.map((c) => c.label.length))

    lines.push("╭───────────────────────────────────────────────────────────╮")
    lines.push("│                  DCP Context Analysis                     │")
    lines.push("╰───────────────────────────────────────────────────────────╯")
    lines.push("")
    lines.push("Session Context Breakdown:")
    lines.push("─".repeat(60))
    lines.push("")

    for (const cat of categories) {
        const bar = createBar(cat.value, breakdown.total, barWidth, cat.char)
        const percentage =
            breakdown.total > 0 ? ((cat.value / breakdown.total) * 100).toFixed(1) : "0.0"
        const labelWithPct = `${cat.label.padEnd(maxLabelLen)} ${percentage.padStart(5)}% `
        const valueStr = formatTokenCount(cat.value).padStart(13)
        lines.push(`${labelWithPct}│${bar.padEnd(barWidth)}│${valueStr}`)
    }

    lines.push("")
    lines.push("─".repeat(60))
    lines.push("")

    lines.push("Summary:")

    if (breakdown.prunedTokens > 0) {
        const withoutPruning = breakdown.total + breakdown.prunedTokens
        const pruned = []
        if (breakdown.prunedToolCount > 0) pruned.push(`${breakdown.prunedToolCount} tools`)
        if (breakdown.prunedMessageCount > 0)
            pruned.push(`${breakdown.prunedMessageCount} messages`)
        lines.push(
            `  Pruned:          ${pruned.join(", ")} (~${formatTokenCount(breakdown.prunedTokens)})`,
        )
        lines.push(`  Current context: ~${formatTokenCount(breakdown.total)}`)
        lines.push(`  Without DCP:     ~${formatTokenCount(withoutPruning)}`)
    } else {
        lines.push(`  Current context: ~${formatTokenCount(breakdown.total)}`)
    }

    lines.push("")

    return lines.join("\n")
}

export async function handleContextCommand(ctx: ContextCommandContext): Promise<void> {
    const { client, state, logger, sessionId, messages } = ctx

    const breakdown = analyzeContextTokens(state, messages)

    const message = formatContextMessage(breakdown)

    const params = getCurrentParams(state, messages, logger)
    await sendIgnoredMessage(client, sessionId, message, params, logger)
}
