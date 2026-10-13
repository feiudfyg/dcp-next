import type { ToolContext } from "./types"
import type { DcpToolDefinition } from "../v2/tool"
import { compressPermission } from "../compress-permission"
import { countTokens } from "../token-utils"
import {
    RANGE_FORMAT_EXTENSION,
    RANGE_PRIOR_BLOCKS_EXTENSION,
    RANGE_PRIOR_SUMMARY_DROP_EXTENSION,
    RANGE_PRIOR_SUMMARY_PRESERVE_EXTENSION,
} from "../prompts/extensions/tool"
import { finalizeSession, prepareSession, type NotificationEntry } from "./pipeline"
import {
    appendProtectedPromptInfo,
    appendProtectedTools,
    appendProtectedUserMessages,
} from "./protected-content"
import {
    appendMissingBlockSummaries,
    injectBlockPlaceholders,
    parseBlockPlaceholders,
    parseReplaceBlockIds,
    resolveRanges,
    validateArgs,
    validateNonOverlapping,
    validateReplaceBlockIds,
    validateSummaryPlaceholders,
} from "./range-utils"
import {
    allocateBlockId,
    allocateRunId,
    applyCompressionState,
    wrapCompressedSummary,
} from "./state"
import { formatCompressionResult } from "./result"
import type { CompressRangeToolArgs, CompressionOutcome } from "./types"

function buildSchema() {
    return {
        type: "object",
        properties: {
            topic: {
                type: "string",
                description:
                    "Short label (3-5 words) for display - e.g., 'Auth System Exploration'",
            },
            content: {
                type: "array",
                description:
                    "One or more ranges to compress, each with start/end boundaries and a summary",
                items: {
                    type: "object",
                    properties: {
                        startId: {
                            type: "string",
                            description:
                                "Message or block ID marking the beginning of range (e.g. m0001, b2)",
                        },
                        endId: {
                            type: "string",
                            description:
                                "Message or block ID marking the end of range (e.g. m0012, b5)",
                        },
                        summary: {
                            type: "string",
                            description:
                                "Complete technical summary replacing all content in range",
                        },
                        replaceBlockIds: {
                            type: "array",
                            items: { type: "string" },
                            description:
                                'Optional prior block IDs to replace, e.g. ["b2"]. Listed blocks are removed and must be covered by your summary. Unlisted omitted prior blocks are preserved automatically.',
                        },
                    },
                    required: ["startId", "endId", "summary"],
                    additionalProperties: false,
                },
            },
        },
        required: ["topic", "content"],
        additionalProperties: false,
    }
}

export function createCompressRangeTool(ctx: ToolContext): DcpToolDefinition {
    ctx.prompts.reload()
    const runtimePrompts = ctx.prompts.getRuntimePrompts()

    const priorBlockExtension =
        RANGE_PRIOR_BLOCKS_EXTENSION +
        (ctx.config.compress.allowPriorSummaryDrop
            ? RANGE_PRIOR_SUMMARY_DROP_EXTENSION
            : RANGE_PRIOR_SUMMARY_PRESERVE_EXTENSION)

    return {
        name: "compress",
        description: runtimePrompts.compressRange + RANGE_FORMAT_EXTENSION + priorBlockExtension,
        input: buildSchema(),
        options: { permission: "compress" },
        async execute(rawInput, toolCtx) {
            const input = rawInput as CompressRangeToolArgs
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
                `Compress Range: ${input.topic}`,
            )
            const resolvedPlans = resolveRanges(input, searchContext, ctx.state)
            validateNonOverlapping(resolvedPlans)

            const notifications: NotificationEntry[] = []
            const preparedPlans: Array<{
                entry: (typeof resolvedPlans)[number]["entry"]
                selection: (typeof resolvedPlans)[number]["selection"]
                anchorMessageId: string
                finalSummary: string
                consumedBlockIds: number[]
                missingBlockIds: number[]
                replaceBlockIds: number[]
            }> = []

            for (const plan of resolvedPlans) {
                const parsedPlaceholders = parseBlockPlaceholders(plan.entry.summary)
                const replaceBlockIds = ctx.config.compress.allowPriorSummaryDrop
                    ? parseReplaceBlockIds(plan.entry)
                    : []
                validateReplaceBlockIds(replaceBlockIds, plan.selection.requiredBlockIds)

                const missingBlockIds = validateSummaryPlaceholders(
                    parsedPlaceholders,
                    plan.selection.requiredBlockIds,
                    plan.selection.startReference,
                    plan.selection.endReference,
                    searchContext.summaryByBlockId,
                    replaceBlockIds,
                )

                const injected = injectBlockPlaceholders(
                    plan.entry.summary,
                    parsedPlaceholders,
                    searchContext.summaryByBlockId,
                    plan.selection.startReference,
                    plan.selection.endReference,
                    replaceBlockIds,
                )

                const summaryWithUsers = appendProtectedUserMessages(
                    injected.expandedSummary,
                    plan.selection,
                    searchContext,
                    ctx.state,
                    ctx.config.compress.protectUserMessages,
                )

                const summaryWithPromptInfo = appendProtectedPromptInfo(
                    summaryWithUsers,
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

                const completedSummary = appendMissingBlockSummaries(
                    summaryWithTools,
                    missingBlockIds,
                    searchContext.summaryByBlockId,
                    injected.consumedBlockIds,
                    replaceBlockIds,
                )

                preparedPlans.push({
                    entry: plan.entry,
                    selection: plan.selection,
                    anchorMessageId: plan.anchorMessageId,
                    finalSummary: completedSummary.expandedSummary,
                    consumedBlockIds: completedSummary.consumedBlockIds,
                    missingBlockIds,
                    replaceBlockIds,
                })
            }

            const runId = allocateRunId(ctx.state)
            const outcomes: CompressionOutcome[] = []

            for (const preparedPlan of preparedPlans) {
                const blockId = allocateBlockId(ctx.state)
                const storedSummary = wrapCompressedSummary(blockId, preparedPlan.finalSummary)
                const summaryTokens = countTokens(storedSummary)

                const applied = applyCompressionState(
                    ctx.state,
                    {
                        topic: input.topic,
                        batchTopic: input.topic,
                        startId: preparedPlan.entry.startId,
                        endId: preparedPlan.entry.endId,
                        mode: "range",
                        runId,
                        compressMessageId: runCtx.messageID,
                        compressCallId: runCtx.callId,
                        summaryTokens,
                    },
                    preparedPlan.selection,
                    preparedPlan.anchorMessageId,
                    blockId,
                    storedSummary,
                    preparedPlan.consumedBlockIds,
                )

                outcomes.push({
                    blockId,
                    topic: input.topic,
                    newMessageCount: applied.newlyCompressedMessageIds.length,
                    newToolCount: applied.newlyCompressedToolIds.length,
                    compressedTokens: applied.compressedTokens,
                    consumedSummaryTokens: applied.consumedSummaryTokens,
                    summaryTokens,
                    netRemovedTokens: applied.netRemovedTokens,
                    consumedBlockIds: preparedPlan.consumedBlockIds,
                    autoNestedBlockIds: preparedPlan.missingBlockIds.filter(
                        (id) => !preparedPlan.replaceBlockIds.includes(id),
                    ),
                })

                notifications.push({
                    blockId,
                    runId,
                    summary: preparedPlan.finalSummary,
                    summaryTokens,
                })
            }

            await finalizeSession(ctx, runCtx, rawMessages, notifications, input.topic)

            return { content: formatCompressionResult({ outcomes }) }
        },
    }
}
