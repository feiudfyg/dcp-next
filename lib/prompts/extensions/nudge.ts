import type { SessionState } from "../../state"

export function buildCompressedBlockGuidance(
    state: SessionState,
    allowPriorSummaryDrop = false,
): string {
    const refs = Array.from(state.prune.messages.activeBlockIds)
        .filter((id) => Number.isInteger(id) && id > 0)
        .sort((a, b) => a - b)
        .map((id) => `b${id}`)
    const blockCount = refs.length
    const blockList = blockCount > 0 ? refs.join(", ") : "none"
    const action = allowPriorSummaryDrop
        ? "- Prior blocks are re-compressible. Include a block's `(bN)` placeholder to keep it, or list it in `replaceBlockIds` to replace it with our condensed summary. Unlisted omitted blocks are preserved automatically."
        : "- Prior blocks are re-compressible. We may include them in a new range; include each required `(bN)` placeholder exactly once."

    return [
        "Compressed block context:",
        `- Active compressed blocks in this session: ${blockCount} (${blockList})`,
        "- We may use `bN` boundaries and include prior blocks in a new range, not only the newest uncompressed messages.",
        action,
    ].join("\n")
}

export function renderMessagePriorityGuidance(priorityLabel: string, refs: string[]): string {
    const refList = refs.length > 0 ? refs.join(", ") : "none"

    return [
        "Message priority context:",
        "- Higher-priority older messages consume more context and should be compressed right away if it is safe to do so.",
        `- ${priorityLabel}-priority message IDs before this point: ${refList}`,
    ].join("\n")
}

export function appendGuidanceToDcpTag(nudgeText: string, guidance: string): string {
    if (!guidance.trim()) {
        return nudgeText
    }

    const closeTag = "</dcp-system-reminder>"
    const closeTagIndex = nudgeText.lastIndexOf(closeTag)

    if (closeTagIndex === -1) {
        return nudgeText
    }

    const beforeClose = nudgeText.slice(0, closeTagIndex).trimEnd()
    const afterClose = nudgeText.slice(closeTagIndex)
    return `${beforeClose}\n\n${guidance}\n${afterClose}`
}
