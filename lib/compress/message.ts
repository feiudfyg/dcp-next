import type { ToolContext } from "./types"
import type { DcpToolDefinition } from "../v2/tool"
import { compressPermission } from "../compress-permission"
import { countTokens } from "../token-utils"
import { MESSAGE_FORMAT_EXTENSION } from "../prompts/extensions/tool"
import { formatIssues, resolveMessages, validateArgs } from "./message-utils"
import { finalizeSession, prepareSession, type NotificationEntry } from "./pipeline"
import { appendProtectedPromptInfo, appendProtectedTools } from "./protected-content"
import {
    allocateBlockId,
    allocateRunId,
    applyCompressionState,
    wrapCompressedSummary,
} from "./state"
import { formatCompressionResult } from "./result"
import type { CompressMessageToolArgs, CompressionOutcome } from "./types"

function buildSchema() {
    return {
        type: "object",
        properties: {
            topic: {
                type: "string",
                description:
                    "Short label (3-5 words) for the overall batch - e.g., 'Closed Research Notes'",
            },
            content: {
                type: "array",
                description: "Batch of individual message summaries to create in one tool call",
                items: {
                    type: "object",
                    properties: {
                        messageId: {
                            type: "string",
                            description: "Raw message ID to compress (e.g. m0001)",
                        },
                        topic: {
                            type: "string",
                            description: "Short label (3-5 words) for this one message summary",
                        },
                        summary: {
                            type: "string",
                            description: "Complete technical summary replacing that one message",
                        },
                    },
                    required: ["messageId", "topic", "summary"],
                    additionalProperties: false,
                },
            },
        },
        required: ["topic", "content"],
        additionalProperties: false,
    }
}

export function createCompressMessageTool(ctx: ToolContext): DcpToolDefinition {
    ctx.prompts.reload()
    const runtimePrompts = ctx.prompts.getRuntimePrompts()

    return {
        name: "compress",
        description: runtimePrompts.compressMessage + MESSAGE_FORMAT_EXTENSION,
        input: buildSchema(),
        options: { permission: "compress" },
        async execute(rawInput, toolCtx) {
            const input = rawInput as CompressMessageToolArgs
            validateArgs(input)

            if (compressPermission(ctx.state, ctx.config) === "deny") {
                throw new Error("Compression is disabled by permissions.")
            }
            const callId = String((toolCtx as any).id ?? (toolCtx as any).callID ?? "")

            const runCtx = {
                sessionID: String((toolCtx as any).sessionID ?? ""),
                messageID: String((toolCtx as any).messageID ?? ""),
                callId,
                setTitle: (title: string) => {
                    const progress = (toolCtx as any).progress
                    if (typeof progress === "function") {
                        void progress({ title })
                    }
                },
            }

            const { rawMessages, searchContext } = await prepareSession(
                ctx,
                runCtx,
                `Compress Message: ${input.topic}`,
            )
            const { plans, skippedIssues, skippedCount } = resolveMessages(
                input,
                searchContext,
                ctx.state,
                ctx.config,
            )

            if (plans.length === 0 && skippedCount > 0) {
                throw new Error(formatIssues(skippedIssues, skippedCount))
            }

            const notifications: NotificationEntry[] = []

            const preparedPlans: Array<{
                plan: (typeof plans)[number]
                summaryWithTools: string
            }> = []

            for (const plan of plans) {
                const summaryWithPromptInfo = appendProtectedPromptInfo(
                    plan.entry.summary,
                    plan.selection,
                    searchContext,
                    ctx.state,
                    ctx.config.compress.protectTags,
                )

                const summaryWithTools = await appendProtectedTools(
                    ctx.client,
                    ctx.state,
                    ctx.config.experimental.allowSubAgents,
                    summaryWithPromptInfo,
                    plan.selection,
                    searchContext,
                    ctx.config.compress.protectedTools,
                    ctx.config.protectedFilePatterns,
                )

                preparedPlans.push({
                    plan,
                    summaryWithTools,
                })
            }

            const runId = allocateRunId(ctx.state)
            const outcomes: CompressionOutcome[] = []

            for (const { plan, summaryWithTools } of preparedPlans) {
                const blockId = allocateBlockId(ctx.state)
                const storedSummary = wrapCompressedSummary(blockId, summaryWithTools)
                const summaryTokens = countTokens(storedSummary)

                const applied = applyCompressionState(
                    ctx.state,
                    {
                        topic: plan.entry.topic,
                        batchTopic: input.topic,
                        startId: plan.entry.messageId,
                        endId: plan.entry.messageId,
                        mode: "message",
                        runId,
                        compressMessageId: runCtx.messageID,
                        compressCallId: runCtx.callId,
                        summaryTokens,
                    },
                    plan.selection,
                    plan.anchorMessageId,
                    blockId,
                    storedSummary,
                    [],
                )

                outcomes.push({
                    blockId,
                    topic: plan.entry.topic,
                    newMessageCount: applied.newlyCompressedMessageIds.length,
                    newToolCount: applied.newlyCompressedToolIds.length,
                    compressedTokens: applied.compressedTokens,
                    consumedSummaryTokens: applied.consumedSummaryTokens,
                    summaryTokens,
                    netRemovedTokens: applied.netRemovedTokens,
                    consumedBlockIds: [],
                    autoNestedBlockIds: [],
                })

                notifications.push({
                    blockId,
                    runId,
                    summary: summaryWithTools,
                    summaryTokens,
                })
            }

            await finalizeSession(ctx, runCtx, rawMessages, notifications, input.topic)

            return { content: formatCompressionResult({ outcomes, skippedIssues, skippedCount }) }
        },
    }
}
