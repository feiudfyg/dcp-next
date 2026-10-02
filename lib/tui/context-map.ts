import { isIgnoredUserMessage } from "../messages/query"
import type { SessionState, WithParts } from "../state"

export type ContextMapEntry =
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
    | {
          kind: "turn"
          startRef: string
          endRef: string
          messageCount: number
          userPreview: string
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
    let turn: Extract<ContextMapEntry, { kind: "turn" }> | undefined
    let compressed: Extract<ContextMapEntry, { kind: "compressed" }> | undefined

    const flushTurn = () => {
        if (turn) {
            entries.push(turn)
            turn = undefined
        }
    }

    for (const message of messages) {
        const ref = state.messageIds.byRawId.get(message.info.id)
        if (!ref) {
            continue
        }

        const pruneEntry = state.prune.messages.byMessageId.get(message.info.id)
        const activeBlockIds = pruneEntry?.activeBlockIds ?? []

        if (activeBlockIds.length > 0) {
            flushTurn()
            const blockId = Math.min(...activeBlockIds)
            if (compressed && compressed.blockId === blockId) {
                compressed.endRef = ref
                compressed.messageCount += 1
                continue
            }
            const block = state.prune.messages.blocksById.get(blockId)
            compressed = {
                kind: "compressed",
                blockId,
                startRef: ref,
                endRef: ref,
                messageCount: 1,
                compressedTokens: block?.compressedTokens ?? 0,
                summaryTokens: block?.summaryTokens ?? 0,
                topic: block?.topic ?? "",
            }
            entries.push(compressed)
            continue
        }

        compressed = undefined

        const isUser = message.info.role === "user" && !isIgnoredUserMessage(message)
        if (isUser) {
            flushTurn()
            turn = {
                kind: "turn",
                startRef: ref,
                endRef: ref,
                messageCount: 1,
                userPreview: previewOf(message),
            }
            continue
        }

        if (!turn) {
            turn = {
                kind: "turn",
                startRef: ref,
                endRef: ref,
                messageCount: 1,
                userPreview: "",
            }
            continue
        }

        turn.endRef = ref
        turn.messageCount += 1
    }

    flushTurn()
    return entries
}
