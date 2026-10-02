import type { SessionState, WithParts } from "../state"

export type ContextMapEntry =
    | {
          kind: "message"
          ref: string
          role: string
          preview: string
      }
    | {
          kind: "compressed"
          blockId: number
          startRef: string
          endRef: string
          messageCount: number
          compressedTokens: number
          summaryTokens: number
          topic: string
      }

function previewOf(message: WithParts): string {
    const parts = Array.isArray(message.parts) ? message.parts : []
    for (const part of parts) {
        if (part.type === "text" && part.text) {
            return part.text.replace(/\s+/g, " ").trim().slice(0, 72)
        }
    }
    for (const part of parts) {
        if (part.type === "tool") {
            return `tool:${(part as any).tool ?? "?"}`
        }
    }
    return ""
}

export function buildContextMap(state: SessionState, messages: WithParts[]): ContextMapEntry[] {
    const entries: ContextMapEntry[] = []

    for (const message of messages) {
        const ref = state.messageIds.byRawId.get(message.info.id)
        if (!ref) {
            continue
        }

        const pruneEntry = state.prune.messages.byMessageId.get(message.info.id)
        const activeBlockIds = pruneEntry?.activeBlockIds ?? []

        if (activeBlockIds.length > 0) {
            const blockId = Math.min(...activeBlockIds)
            const block = state.prune.messages.blocksById.get(blockId)
            const last = entries[entries.length - 1]
            if (last && last.kind === "compressed" && last.blockId === blockId) {
                last.endRef = ref
                last.messageCount += 1
            } else {
                entries.push({
                    kind: "compressed",
                    blockId,
                    startRef: ref,
                    endRef: ref,
                    messageCount: 1,
                    compressedTokens: block?.compressedTokens ?? 0,
                    summaryTokens: block?.summaryTokens ?? 0,
                    topic: block?.topic ?? "",
                })
            }
            continue
        }

        entries.push({
            kind: "message",
            ref,
            role: message.info.role,
            preview: previewOf(message),
        })
    }

    return entries
}
