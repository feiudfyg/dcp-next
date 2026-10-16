import type {
    DcpMessageInfo,
    DcpPart,
    DcpToolPart,
    DcpToolState,
    DcpTokenUsage,
    WithParts,
} from "../state"
import { isDcpNotificationText } from "../dcp-marker"

/**
 * Structural views of the OpenCode v2 data that DCP consumes.
 *
 * The server hands the request hook the `@opencode/ai` projection of the
 * conversation (`Message` with `role` + `content: ContentPart[]`), while the
 * persisted transcript (`ctx.session.context`) carries stable ids, token usage,
 * tool state and compaction markers. These interfaces describe only the fields
 * DCP reads, keeping the port decoupled from the exact schema package.
 */

export interface RequestContentPart {
    type: string
    [key: string]: any
}

export interface RequestMessage {
    role: string
    content: RequestContentPart[]
    id?: string
    [key: string]: any
}

export interface SessionMessageLike {
    type: string
    id?: string
    [key: string]: any
}

export function epochMs(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value
    }
    if (value && typeof value === "object") {
        const candidate = value as any
        if (typeof candidate.epochMillis === "number") {
            return candidate.epochMillis
        }
        if (typeof candidate.epochMilliseconds === "number") {
            return candidate.epochMilliseconds
        }
        if (typeof candidate.getTime === "function") {
            return candidate.getTime()
        }
    }
    if (typeof value === "string") {
        const parsed = Date.parse(value)
        if (!Number.isNaN(parsed)) {
            return parsed
        }
    }
    return 0
}

function contentToText(content: unknown): string | undefined {
    if (content === undefined || content === null) {
        return undefined
    }
    if (typeof content === "string") {
        return content
    }
    if (Array.isArray(content)) {
        const chunks: string[] = []
        for (const item of content) {
            if (item && typeof item === "object") {
                const record = item as Record<string, unknown>
                if (typeof record.text === "string") {
                    chunks.push(record.text)
                } else if (record.type === "file" && typeof record.uri === "string") {
                    chunks.push(String(record.uri))
                } else {
                    chunks.push(JSON.stringify(item))
                }
            } else if (item !== undefined) {
                chunks.push(String(item))
            }
        }
        return chunks.join("\n")
    }
    return JSON.stringify(content)
}

function valueToText(result: unknown): string | undefined {
    if (!result || typeof result !== "object") {
        return contentToText(result)
    }
    const record = result as Record<string, any>
    if (record.type === "content") {
        return contentToText(record.value)
    }
    if ("value" in record) {
        return contentToText(record.value)
    }
    return contentToText(result)
}

function tokenUsage(tokens: unknown): DcpTokenUsage | undefined {
    if (!tokens || typeof tokens !== "object") {
        return undefined
    }
    const record = tokens as Record<string, any>
    return {
        input: typeof record.input === "number" ? record.input : undefined,
        output: typeof record.output === "number" ? record.output : undefined,
        reasoning: typeof record.reasoning === "number" ? record.reasoning : undefined,
        cache:
            record.cache && typeof record.cache === "object"
                ? {
                      read: typeof record.cache.read === "number" ? record.cache.read : undefined,
                      write:
                          typeof record.cache.write === "number" ? record.cache.write : undefined,
                  }
                : undefined,
    }
}

function toolStateFromSession(state: any): DcpToolState {
    if (!state || typeof state !== "object") {
        return { status: "pending" }
    }

    switch (state.status) {
        case "streaming":
            return { status: "pending", input: state.input }
        case "running":
            return { status: "running", input: state.input, metadata: state.metadata }
        case "completed":
            return {
                status: "completed",
                input: state.input,
                output: contentToText(state.content),
                metadata: state.metadata,
                time: {
                    start: epochMs(state.time?.ran ?? state.time?.created),
                    end: epochMs(state.time?.completed),
                },
            }
        case "error":
            return {
                status: "error",
                input: state.input,
                error: state.error,
                metadata: state.metadata,
            }
        default:
            return { status: "pending", input: state.input }
    }
}

function assistantParts(content: unknown): DcpPart[] {
    const parts: DcpPart[] = []
    if (!Array.isArray(content)) {
        return parts
    }

    for (const raw of content) {
        if (!raw || typeof raw !== "object") {
            continue
        }
        const part = raw as Record<string, any>
        switch (part.type) {
            case "text":
                parts.push({ type: "text", text: String(part.text ?? "") })
                break
            case "reasoning":
                parts.push({ type: "reasoning", text: String(part.text ?? "") })
                break
            case "tool":
                parts.push({
                    type: "tool",
                    callID: String(part.id ?? ""),
                    tool: String(part.name ?? ""),
                    state: toolStateFromSession(part.state),
                })
                break
            default:
                break
        }
    }

    return parts
}

function sessionRole(sm: SessionMessageLike): "user" | "assistant" {
    return sm.type === "assistant" || sm.type === "compaction" ? "assistant" : "user"
}

function sessionInfo(
    sm: SessionMessageLike | undefined,
    id: string,
    sessionID: string,
    role: "user" | "assistant",
): DcpMessageInfo {
    const info: DcpMessageInfo = {
        id,
        sessionID,
        role,
        time: { created: epochMs(sm?.time?.created) },
    }

    if (!sm) {
        return info
    }

    if (sm.type === "compaction") {
        info.summary = true
    }

    if (role === "assistant") {
        info.agent = typeof sm.agent === "string" ? sm.agent : undefined
        info.tokens = tokenUsage(sm.tokens)
        if (sm.model && typeof sm.model === "object") {
            info.model = {
                providerID: sm.model.providerID,
                modelID: sm.model.id,
                variant: sm.model.variant,
            }
            info.modelID = sm.model.id
            info.providerID = sm.model.providerID
            info.variant = sm.model.variant
        }
    }

    return info
}

/** Normalize a persisted `SessionMessage.Info[]` transcript into DCP's model. */
export function normalizeSessionMessages(
    raw: readonly unknown[] | undefined,
    sessionID: string,
): WithParts[] {
    const messages: WithParts[] = []
    if (!Array.isArray(raw)) {
        return messages
    }

    for (const item of raw) {
        if (!item || typeof item !== "object") {
            continue
        }
        const sm = item as SessionMessageLike
        const id = typeof sm.id === "string" ? sm.id : undefined
        if (!id) {
            continue
        }

        if (sm.type === "synthetic" && isDcpNotificationText(String(sm.text ?? ""))) {
            continue
        }

        switch (sm.type) {
            case "user":
            case "synthetic":
                messages.push({
                    info: sessionInfo(sm, id, sessionID, "user"),
                    parts: [{ type: "text", text: String(sm.text ?? "") }],
                })
                break
            case "assistant":
                messages.push({
                    info: sessionInfo(sm, id, sessionID, "assistant"),
                    parts: assistantParts(sm.content),
                })
                break
            case "compaction":
                messages.push({
                    info: sessionInfo(sm, id, sessionID, "assistant"),
                    parts: [],
                })
                break
            default:
                break
        }
    }

    return messages
}

function requestPartToInternal(part: RequestContentPart): DcpPart {
    switch (part.type) {
        case "text":
            return { type: "text", text: String(part.text ?? "") }
        case "reasoning":
            return { type: "reasoning", text: String(part.text ?? "") }
        default:
            // Media, provider compaction, effort, and provider-specific parts are
            // preserved verbatim so the rebuild is lossless.
            return { type: "opaque", value: part }
    }
}

function requestMessageText(message: RequestMessage | undefined): string {
    if (!message || !Array.isArray(message.content)) {
        return ""
    }
    let text = ""
    for (const part of message.content) {
        if (part && part.type === "text" && typeof part.text === "string") {
            text += part.text
        }
    }
    return text
}

/**
 * Drop DCP's own notification messages from the outgoing request. On hosts
 * without a toast channel DCP notifies via `session.synthetic`, which persists
 * in the transcript; forwarding it to the model wastes context every turn.
 */
export function filterDcpNotificationMessages<T extends RequestMessage>(messages: T[]): T[] {
    if (!Array.isArray(messages)) {
        return []
    }
    return messages.filter((message) => !isDcpNotificationText(requestMessageText(message)))
}

/**
 * Build DCP's internal model from the outgoing request messages, enriching each
 * message with persisted metadata (tokens, tool state, compaction) when the
 * request message can be correlated to a session message.
 *
 * Correlation order:
 *   1. `message.id` when present.
 *   2. A tool-call id shared with exactly one session assistant message.
 *   3. Positional alignment against the model-visible session transcript.
 */
export function requestToInternal(
    requestMessages: RequestMessage[],
    sessionMessages: readonly unknown[],
    sessionID: string,
): WithParts[] {
    const ordered: SessionMessageLike[] = []
    const byId = new Map<string, SessionMessageLike>()
    const toolCallToSessionId = new Map<string, string>()

    if (Array.isArray(sessionMessages)) {
        for (const item of sessionMessages) {
            if (!item || typeof item !== "object") {
                continue
            }
            const sm = item as SessionMessageLike
            if (typeof sm.id !== "string") {
                continue
            }
            byId.set(sm.id, sm)
            if (sm.type === "assistant" && Array.isArray(sm.content)) {
                for (const content of sm.content) {
                    if (content && content.type === "tool" && typeof content.id === "string") {
                        toolCallToSessionId.set(content.id, sm.id)
                    }
                }
            }
            if (
                sm.type === "user" ||
                sm.type === "synthetic" ||
                sm.type === "assistant" ||
                sm.type === "compaction"
            ) {
                ordered.push(sm)
            }
        }
    }

    const toolCallParts = new Map<string, RequestContentPart>()
    const toolResultParts = new Map<string, RequestContentPart>()
    for (const message of requestMessages) {
        if (!Array.isArray(message.content)) {
            continue
        }
        for (const part of message.content) {
            if (part.type === "tool-call" && typeof part.id === "string") {
                toolCallParts.set(part.id, part)
            } else if (part.type === "tool-result" && typeof part.id === "string") {
                toolResultParts.set(part.id, part)
            }
        }
    }

    const result: WithParts[] = []
    let pointer = 0

    for (let index = 0; index < requestMessages.length; index++) {
        const message = requestMessages[index]

        if (message.role === "tool" || message.role === "system") {
            // Tool-result transport messages and out-of-domain control messages
            // (e.g. a system/effort message) are not modeled by DCP. Tool
            // results are folded into the originating assistant message; system
            // messages are re-emitted verbatim in internalToRequest. Neither
            // consumes alignment.
            continue
        }

        const role: "user" | "assistant" = message.role === "assistant" ? "assistant" : "user"
        let resolvedId: string | undefined =
            typeof message.id === "string" && message.id.length > 0 ? message.id : undefined

        if (!resolvedId && Array.isArray(message.content)) {
            for (const part of message.content) {
                if (part.type === "tool-call" && typeof part.id === "string") {
                    const candidate = toolCallToSessionId.get(part.id)
                    if (candidate) {
                        resolvedId = candidate
                        const position = ordered.findIndex((sm) => sm.id === candidate)
                        if (position >= 0) {
                            pointer = position + 1
                        }
                        break
                    }
                }
            }
        }

        if (!resolvedId) {
            while (pointer < ordered.length && sessionRole(ordered[pointer]) !== role) {
                pointer++
            }
            const candidate = ordered[pointer]
            if (candidate) {
                resolvedId = candidate.id
                pointer++
            }
        }

        const id = resolvedId ?? `req:${index}`
        const sm = byId.get(id)
        const info = sessionInfo(sm, id, sessionID, role)

        const parts: DcpPart[] = []
        if (Array.isArray(message.content)) {
            for (const part of message.content) {
                if (part.type === "tool-call") {
                    const callId = String(part.id ?? "")
                    const resultPart = toolResultParts.get(callId)
                    const sessionTool = sm ? assistantToolState(sm, callId) : undefined
                    const state: DcpToolState = sessionTool ?? {
                        status: resultPart ? "completed" : "pending",
                        input: part.input,
                        output: resultPart ? valueToText(resultPart.result) : undefined,
                    }
                    parts.push({
                        type: "tool",
                        callID: callId,
                        tool: String(part.name ?? ""),
                        state,
                    })
                    continue
                }

                const converted = requestPartToInternal(part)
                parts.push(converted)
            }
        }

        if (parts.length === 0 && message.role !== "assistant") {
            parts.push({ type: "text", text: "" })
        }

        result.push({ info, parts })
    }

    return result
}

function assistantToolState(sm: SessionMessageLike, callId: string): DcpToolState | undefined {
    if (!Array.isArray(sm.content)) {
        return undefined
    }
    for (const content of sm.content) {
        if (content && content.type === "tool" && content.id === callId) {
            return toolStateFromSession(content.state)
        }
    }
    return undefined
}

function internalPartToRequest(part: DcpPart): RequestContentPart[] {
    switch (part.type) {
        case "text":
            return [{ type: "text", text: part.text }]
        case "reasoning":
            return [{ type: "reasoning", text: part.text }]
        case "opaque":
            return [part.value as RequestContentPart]
        default:
            return []
    }
}

function toolCallToRequest(part: DcpToolPart): RequestContentPart {
    return { type: "tool-call", id: part.callID, name: part.tool, input: part.state.input }
}

function toolResultToRequest(part: DcpToolPart): RequestContentPart | undefined {
    if (part.state.status === "completed" && part.state.output !== undefined) {
        return {
            type: "tool-result",
            id: part.callID,
            name: part.tool,
            result: { type: "text", value: String(part.state.output) },
        }
    }
    if (part.state.status === "error" && part.state.error !== undefined) {
        return {
            type: "tool-result",
            id: part.callID,
            name: part.tool,
            result: { type: "error", value: part.state.error },
        }
    }
    return undefined
}

const SYNTHETIC_SUMMARY_PREFIX = "msg_dcp_summary_"

function isSyntheticId(id: string): boolean {
    return id.startsWith(SYNTHETIC_SUMMARY_PREFIX)
}

/**
 * Rebuild the outgoing request messages from DCP's (possibly pruned) internal
 * model. Assistant tool calls are emitted in the assistant message; tool
 * results are emitted as a following `role: "tool"` message, matching the
 * model-request contract. Synthetic summary messages become fresh user
 * messages.
 */
export function internalToRequest(
    internal: WithParts[],
    original: RequestMessage[],
): RequestMessage[] {
    const originalById = new Map<string, RequestMessage>()
    for (const message of original) {
        if (typeof message.id === "string") {
            originalById.set(message.id, message)
        }
    }

    const output: RequestMessage[] = []

    for (const message of internal) {
        const id = message.info.id
        const content: RequestContentPart[] = []
        const toolResults: RequestContentPart[] = []

        for (const part of message.parts) {
            if (part.type === "tool") {
                content.push(toolCallToRequest(part))
                const result = toolResultToRequest(part)
                if (result) {
                    toolResults.push(result)
                }
                continue
            }
            content.push(...internalPartToRequest(part))
        }

        const source = originalById.get(id)
        if (source) {
            output.push({ ...source, role: message.info.role, content })
        } else if (isSyntheticId(id) || !originalById.has(id)) {
            output.push({ role: message.info.role, content })
        }

        if (toolResults.length > 0) {
            output.push({ role: "tool", content: toolResults })
        }
    }

    // Re-insert out-of-domain control messages (system/effort) verbatim at their
    // original relative position. DCP does not model them, so they are absent
    // from the internal list and would otherwise be dropped from the request.
    const outputIndexById = new Map<string, number>()
    output.forEach((message, index) => {
        if (typeof message.id === "string") {
            outputIndexById.set(message.id, index)
        }
    })

    const inserts: Array<{ index: number; order: number; message: RequestMessage }> = []
    for (let i = 0; i < original.length; i++) {
        const message = original[i]
        if (message.role !== "system") {
            continue
        }

        let predecessor = -1
        for (let j = i - 1; j >= 0; j--) {
            const id = original[j].id
            if (typeof id === "string" && outputIndexById.has(id)) {
                predecessor = outputIndexById.get(id)!
                break
            }
        }
        if (predecessor >= 0) {
            inserts.push({ index: predecessor + 1, order: i, message })
            continue
        }

        let successor = -1
        for (let j = i + 1; j < original.length; j++) {
            const id = original[j].id
            if (typeof id === "string" && outputIndexById.has(id)) {
                successor = outputIndexById.get(id)!
                break
            }
        }
        inserts.push({ index: successor >= 0 ? successor : output.length, order: i, message })
    }

    if (inserts.length > 0) {
        inserts.sort((a, b) => b.index - a.index || b.order - a.order)
        for (const insert of inserts) {
            output.splice(insert.index, 0, insert.message)
        }
    }

    return output
}
