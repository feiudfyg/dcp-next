import { formatSignedTokenAmount, formatTokenAmount } from "../token-format"
import type { CompressionOutcome } from "./types"

export interface CompressionResultReport {
    outcomes: CompressionOutcome[]
    skippedIssues?: string[]
    skippedCount?: number
}

export function formatCompressionResult(report: CompressionResultReport): string {
    const outcomes = report.outcomes
    const totalNewMessages = outcomes.reduce((total, outcome) => total + outcome.newMessageCount, 0)
    const lines: string[] = []

    if (outcomes.length === 0) {
        lines.push("Compressed 0 messages.")
    } else {
        const noun = totalNewMessages === 1 ? "message" : "messages"
        const refs = outcomes.map((outcome) => `b${outcome.blockId}`).join(", ")
        lines.push(`Compressed ${totalNewMessages} new ${noun} into ${refs}.`)

        for (const outcome of outcomes) {
            const parts: string[] = []
            if (outcome.compressedTokens > 0) {
                parts.push(`removed ${formatTokenAmount(outcome.compressedTokens)}`)
            }
            if (outcome.consumedSummaryTokens > 0) {
                parts.push(
                    `replaced prior summary ${formatTokenAmount(outcome.consumedSummaryTokens)}`,
                )
            }
            parts.push(`summary ${formatTokenAmount(outcome.summaryTokens)}`)
            parts.push(`net ${formatSignedTokenAmount(outcome.netRemovedTokens)} tokens`)
            lines.push(`- b${outcome.blockId} "${outcome.topic}": ${parts.join(", ")}`)
        }
    }

    const autoNested = outcomes.flatMap((outcome) => outcome.autoNestedBlockIds)
    if (autoNested.length > 0) {
        const refs = autoNested.map((id) => `b${id}`).join(", ")
        lines.push(
            `Note: prior blocks ${refs} were nested in full because they were not referenced with (bN) or listed in replaceBlockIds.`,
        )
    }

    for (const outcome of outcomes) {
        if (outcome.netRemovedTokens <= 0) {
            lines.push(
                `Warning: b${outcome.blockId} did not reduce context (net ${formatSignedTokenAmount(outcome.netRemovedTokens)} tokens). Use a shorter summary or a narrower range.`,
            )
        }
    }

    const skippedCount = report.skippedCount ?? 0
    if (skippedCount > 0 && report.skippedIssues) {
        const noun = skippedCount === 1 ? "issue" : "issues"
        const issueLines = report.skippedIssues.map((issue) => `- ${issue}`).join("\n")
        lines.push(`Skipped ${skippedCount} ${noun}:\n${issueLines}`)
    }

    return lines.join("\n")
}
