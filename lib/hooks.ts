import type { SessionState, WithParts } from "./state"
import type { Logger } from "./logger"
import type { PluginConfig } from "./config"
import { assignMessageRefs } from "./message-ids"
import {
    buildPriorityMap,
    buildToolIdList,
    injectCompressNudges,
    injectExtendedSubAgentResults,
    injectMessageIds,
    prune,
    stripHallucinations,
    stripHallucinationsFromString,
    stripStaleMetadata,
    syncCompressionBlocks,
} from "./messages"
import { renderSystemPrompt, type PromptStore } from "./prompts"
import { buildProtectedToolsExtension } from "./prompts/extensions/system"
import {
    applyPendingCompressionDurations,
    buildCompressionTimingKey,
    consumeCompressionStart,
    resolveCompressionDuration,
} from "./compress/timing"
import { filterMessages, filterMessagesInPlace } from "./messages/shape"
import {
    applyPendingManualTrigger,
    handleContextCommand,
    handleDecompressCommand,
    handleHelpCommand,
    handleManualToggleCommand,
    handleManualTriggerCommand,
    handleRecompressCommand,
    handleStatsCommand,
    handleSweepCommand,
} from "./commands"
import { buildHostPermissionSnapshot, type HostPermissionSnapshot } from "./host-permissions"
import { compressPermission, syncCompressPermissionState } from "./compress-permission"
import { checkSession, ensureSessionInitialized, saveSessionState, syncToolCache } from "./state"
import type { SdkClient } from "./sdk-types"
import { cacheSystemPromptTokens } from "./ui/utils"

const INTERNAL_AGENT_SIGNATURES = [
    "You are a title generator",
    "You are a helpful AI assistant tasked with summarizing conversations",
    "You are an anchored context summarization assistant for coding sessions",
    "Summarize what was done in this conversation",
]

function isInternalAgentCall(systemPrompts: string[]): boolean {
    const primaryPrompt = systemPrompts[0]
    if (typeof primaryPrompt !== "string" || primaryPrompt.length === 0) {
        return false
    }

    return INTERNAL_AGENT_SIGNATURES.some((signature) => primaryPrompt.includes(signature))
}

export function createSystemPromptHandler(
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    prompts: PromptStore,
) {
    return async (
        input: { sessionID?: string; model: { limit: { context: number } } },
        output: { system: string[] },
    ) => {
        if (input.model?.limit?.context) {
            state.modelContextLimit = input.model.limit.context
            logger.debug("Cached model context limit", { limit: state.modelContextLimit })
        }

        if (state.isSubAgent && !config.experimental.allowSubAgents) {
            return
        }

        if (isInternalAgentCall(output.system)) {
            logger.info("Skipping DCP system prompt injection for internal agent")
            return
        }

        const effectivePermission =
            input.sessionID && state.sessionId === input.sessionID
                ? compressPermission(state, config)
                : config.compress.permission

        if (effectivePermission === "deny") {
            return
        }

        prompts.reload()
        const runtimePrompts = prompts.getRuntimePrompts()
        const newPrompt = renderSystemPrompt(
            runtimePrompts,
            buildProtectedToolsExtension(config.compress.protectedTools),
            !!state.manualMode,
            state.isSubAgent && config.experimental.allowSubAgents,
        )
        if (output.system.length > 0) {
            output.system[output.system.length - 1] += "\n\n" + newPrompt
        } else {
            output.system.push(newPrompt)
        }
    }
}

interface PipelineDeps {
    client: SdkClient
    state: SessionState
    logger: Logger
    config: PluginConfig
    prompts: PromptStore
    hostPermissions: HostPermissionSnapshot
}

interface PipelineOptions {
    refreshPermissions?: boolean
    compactionSource?: WithParts[]
    afterPermission?: () => void
}

/**
 * The shared message pipeline for both the v1 (`chat.messages.transform`) and
 * v2 (`session.hook("context")`) handlers. Keeping this single-sourced prevents
 * the two hosts from drifting apart.
 */
async function runMessagePipeline(
    deps: PipelineDeps,
    messages: WithParts[],
    options: PipelineOptions = {},
): Promise<void> {
    const { client, state, logger, config, prompts, hostPermissions } = deps

    await checkSession(
        client,
        state,
        logger,
        messages,
        config.manualMode.enabled,
        options.compactionSource ?? messages,
    )

    if (options.refreshPermissions) {
        await refreshHostPermissions(client, hostPermissions)
    }

    syncCompressPermissionState(state, config, hostPermissions, messages)

    if (state.isSubAgent && !config.experimental.allowSubAgents) {
        return
    }

    options.afterPermission?.()

    stripHallucinations(messages)
    cacheSystemPromptTokens(state, messages)
    assignMessageRefs(state, messages)
    syncCompressionBlocks(state, logger, messages)
    syncToolCache(state, config, logger, messages)
    buildToolIdList(state, messages)
    prune(state, logger, config, messages)
    await injectExtendedSubAgentResults(
        client,
        state,
        logger,
        messages,
        config.experimental.allowSubAgents,
    )
    const compressionPriorities = buildPriorityMap(config, state, messages)
    prompts.reload()
    injectCompressNudges(
        state,
        config,
        logger,
        messages,
        prompts.getRuntimePrompts(),
        compressionPriorities,
    )
    injectMessageIds(state, config, messages, compressionPriorities)
    applyPendingManualTrigger(state, messages, logger)
    stripStaleMetadata(messages)

    if (state.sessionId) {
        await logger.saveContext(state.sessionId, messages)
    }
}

export function createChatMessageTransformHandler(
    client: SdkClient,
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    prompts: PromptStore,
    hostPermissions: HostPermissionSnapshot,
) {
    return async (input: {}, output: { messages: WithParts[] }) => {
        const receivedMessages = Array.isArray(output.messages) ? output.messages.length : 0
        const messages = filterMessagesInPlace(output.messages)
        if (messages !== output.messages) {
            output.messages = messages
        }
        if (messages.length !== receivedMessages) {
            logger.warn("Skipping messages with unexpected shape during chat transform", {
                received: receivedMessages,
                usable: messages.length,
            })
        }

        await runMessagePipeline(
            { client, state, logger, config, prompts, hostPermissions },
            output.messages,
        )
    }
}

const DCP_COMMAND_HANDLED = "__DCP_COMMAND_HANDLED__"

export function createCommandExecuteHandler(
    client: SdkClient,
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    workingDirectory: string,
    hostPermissions: HostPermissionSnapshot,
) {
    return async (
        input: { command: string; sessionID: string; arguments: string },
        output: { parts: any[] },
    ) => {
        if (!config.commands.enabled) {
            return
        }

        if (input.command === "dcp" || input.command === "dcp-compress") {
            const messagesResponse = await (client as any).session.messages({
                path: { id: input.sessionID },
            })
            const messages = filterMessages(messagesResponse.data || messagesResponse)

            await ensureSessionInitialized(
                client,
                state,
                input.sessionID,
                logger,
                messages,
                config.manualMode.enabled,
            )

            syncCompressPermissionState(state, config, hostPermissions, messages)

            const effectivePermission = compressPermission(state, config)
            if (effectivePermission === "deny") {
                throw new Error(DCP_COMMAND_HANDLED)
            }

            output.parts.length = 0

            const args = (input.arguments || "").trim().split(/\s+/).filter(Boolean)
            const isCompressCommand = input.command === "dcp-compress"
            const subcommand = isCompressCommand ? "compress" : args[0]?.toLowerCase() || ""
            const subArgs = isCompressCommand ? args : args.slice(1)

            const commandCtx = {
                client,
                state,
                config,
                logger,
                sessionId: input.sessionID,
                messages,
            }

            if (subcommand === "context") {
                await handleContextCommand(commandCtx)
                throw new Error(DCP_COMMAND_HANDLED)
            }

            if (subcommand === "stats") {
                await handleStatsCommand(commandCtx)
                throw new Error(DCP_COMMAND_HANDLED)
            }

            if (subcommand === "sweep") {
                await handleSweepCommand({
                    ...commandCtx,
                    args: subArgs,
                    workingDirectory,
                })
                throw new Error(DCP_COMMAND_HANDLED)
            }

            if (subcommand === "manual") {
                await handleManualToggleCommand(commandCtx, subArgs[0]?.toLowerCase())
                throw new Error(DCP_COMMAND_HANDLED)
            }

            if (subcommand === "compress") {
                const userFocus = subArgs.join(" ").trim()
                const prompt = await handleManualTriggerCommand(commandCtx, "compress", userFocus)
                if (!prompt) {
                    throw new Error("__DCP_MANUAL_TRIGGER_BLOCKED__")
                }

                state.manualMode = "compress-pending"
                state.pendingManualTrigger = {
                    sessionId: input.sessionID,
                    prompt,
                }
                const rawArgs = (input.arguments || "").trim()
                output.parts.length = 0
                output.parts.push({
                    type: "text",
                    text: isCompressCommand
                        ? rawArgs
                            ? `/dcp-compress ${rawArgs}`
                            : "/dcp-compress"
                        : rawArgs
                          ? `/dcp ${rawArgs}`
                          : `/dcp ${subcommand}`,
                })
                return
            }

            if (subcommand === "decompress") {
                await handleDecompressCommand({
                    ...commandCtx,
                    args: subArgs,
                })
                throw new Error(DCP_COMMAND_HANDLED)
            }

            if (subcommand === "recompress") {
                await handleRecompressCommand({
                    ...commandCtx,
                    args: subArgs,
                })
                throw new Error(DCP_COMMAND_HANDLED)
            }

            await handleHelpCommand(commandCtx)
            throw new Error(DCP_COMMAND_HANDLED)
        }
    }
}

export function createTextCompleteHandler() {
    return async (
        _input: { sessionID: string; messageID: string; partID: string },
        output: { text: string },
    ) => {
        output.text = stripHallucinationsFromString(output.text)
    }
}

export function createEventHandler(state: SessionState, logger: Logger) {
    return async (input: { event: any }) => {
        const eventTime =
            typeof input.event?.time === "number" && Number.isFinite(input.event.time)
                ? input.event.time
                : typeof input.event?.properties?.time === "number" &&
                    Number.isFinite(input.event.properties.time)
                  ? input.event.properties.time
                  : undefined

        if (input.event.type !== "message.part.updated") {
            return
        }

        const part = input.event.properties?.part
        if (part?.type !== "tool" || part.tool !== "compress") {
            return
        }

        if (part.state.status === "pending") {
            if (typeof part.callID !== "string" || typeof part.messageID !== "string") {
                return
            }

            const startedAt = eventTime ?? Date.now()
            const key = buildCompressionTimingKey(part.messageID, part.callID)
            if (state.compressionTiming.startsByCallId.has(key)) {
                return
            }
            state.compressionTiming.startsByCallId.set(key, startedAt)
            logger.debug("Recorded compression start", {
                messageID: part.messageID,
                callID: part.callID,
                startedAt,
            })
            return
        }

        if (part.state.status === "completed") {
            if (typeof part.callID !== "string" || typeof part.messageID !== "string") {
                return
            }

            const key = buildCompressionTimingKey(part.messageID, part.callID)
            const start = consumeCompressionStart(state, part.messageID, part.callID)
            const durationMs = resolveCompressionDuration(start, eventTime, part.state.time)
            if (typeof durationMs !== "number") {
                return
            }

            state.compressionTiming.pendingByCallId.set(key, {
                messageId: part.messageID,
                callId: part.callID,
                durationMs,
            })

            const updates = applyPendingCompressionDurations(state)
            if (updates === 0) {
                return
            }

            await saveSessionState(state, logger)

            logger.info("Attached compression time to blocks", {
                messageID: part.messageID,
                callID: part.callID,
                blocks: updates,
                durationMs,
            })
            return
        }

        if (part.state.status === "running") {
            return
        }

        if (typeof part.callID === "string" && typeof part.messageID === "string") {
            state.compressionTiming.startsByCallId.delete(
                buildCompressionTimingKey(part.messageID, part.callID),
            )
        }
    }
}

import {
    filterDcpNotificationMessages,
    internalToRequest,
    normalizeSessionMessages,
    requestToInternal,
} from "./v2/messages"
import { resolveModelContextLimit } from "./v2/model"

interface SystemPartLike {
    type: string
    text?: string
    [key: string]: unknown
}

interface ContextHookEvent {
    sessionID: string
    agent?: string
    model?: { providerID?: string; id?: string; variant?: string }
    system: SystemPartLike[]
    messages: unknown[]
    options?: Record<string, unknown>
    tools?: Record<string, unknown>
}

function appendSystemPrompt(event: ContextHookEvent, prompt: string): void {
    const parts = event.system
    if (!Array.isArray(parts) || parts.length === 0) {
        event.system = [{ type: "text", text: prompt }]
        return
    }

    const last = parts[parts.length - 1]
    if (last && last.type === "text" && typeof last.text === "string") {
        last.text = `${last.text}\n\n${prompt}`
    } else {
        parts.push({ type: "text", text: prompt })
    }
}

function readSystemTexts(event: ContextHookEvent): string[] {
    if (!Array.isArray(event.system)) {
        return []
    }
    return event.system
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text as string)
}

/**
 * The OpenCode v2 `context` hook runs immediately before an agent model request
 * and owns both the system prompt and the assembled messages. DCP injects its
 * guidance into `event.system` and prunes `event.messages`.
 */
async function refreshHostPermissions(
    client: SdkClient,
    snapshot: HostPermissionSnapshot,
): Promise<void> {
    try {
        const agentDomain = (client as any)?.agent
        if (!agentDomain || typeof agentDomain.list !== "function") {
            return
        }
        const agents = await agentDomain.list()
        const next = buildHostPermissionSnapshot(Array.isArray(agents) ? agents : [])
        snapshot.global = next.global
        snapshot.agents = next.agents
    } catch {
        // Host permission introspection is best-effort.
    }
}

export function createContextHookHandler(
    client: SdkClient,
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    prompts: PromptStore,
    hostPermissions: HostPermissionSnapshot,
) {
    return async (event: ContextHookEvent): Promise<void> => {
        const sessionID = event.sessionID

        if (event.model) {
            const limit = await resolveModelContextLimit(
                client,
                event.model.providerID,
                event.model.id,
            )
            if (limit !== undefined) {
                state.modelContextLimit = limit
            }
        }

        let sessionMessages: readonly unknown[] = []
        try {
            sessionMessages = await (client as any).session.context({ sessionID })
        } catch (error: any) {
            logger.warn("Failed to load session context", { error: error?.message })
        }

        const requestMessages = filterDcpNotificationMessages(
            Array.isArray(event.messages)
                ? (event.messages as Parameters<typeof requestToInternal>[0])
                : [],
        )

        if (requestMessages.length === 0) {
            return
        }

        const messages: WithParts[] = requestToInternal(requestMessages, sessionMessages, sessionID)

        const normalizedSession = normalizeSessionMessages(sessionMessages, sessionID)

        await runMessagePipeline(
            { client, state, logger, config, prompts, hostPermissions },
            messages,
            {
                refreshPermissions: true,
                compactionSource: normalizedSession,
                afterPermission: () => {
                    const effectivePermission =
                        state.sessionId === sessionID
                            ? compressPermission(state, config)
                            : config.compress.permission

                    if (
                        effectivePermission !== "deny" &&
                        !isInternalAgentCall(readSystemTexts(event))
                    ) {
                        prompts.reload()
                        const newPrompt = renderSystemPrompt(
                            prompts.getRuntimePrompts(),
                            buildProtectedToolsExtension(config.compress.protectedTools),
                            !!state.manualMode,
                            state.isSubAgent && config.experimental.allowSubAgents,
                        )
                        appendSystemPrompt(event, newPrompt)
                    }
                },
            },
        )

        const rebuilt = internalToRequest(messages, requestMessages)
        event.messages = rebuilt
    }
}

/**
 * Command executor for the model-driven `/dcp-compress` command: it records the
 * pending manual trigger and lets the default (empty-template) command run so
 * the model invokes the `compress` tool.
 */
export function createCompressCommandExecutor(
    client: SdkClient,
    state: SessionState,
    logger: Logger,
    config: PluginConfig,
    workingDirectory: string,
    hostPermissions: HostPermissionSnapshot,
) {
    return async (input: {
        sessionID: string
        arguments?: string
    }): Promise<{ text: string } | undefined> => {
        const messagesResponse = await (client as any).session.context({
            sessionID: input.sessionID,
        })
        const messages = normalizeSessionMessages(messagesResponse as unknown[], input.sessionID)

        await ensureSessionInitialized(
            client,
            state,
            input.sessionID,
            logger,
            messages,
            config.manualMode.enabled,
        )

        syncCompressPermissionState(state, config, hostPermissions, messages)

        if (compressPermission(state, config) === "deny") {
            return undefined
        }

        const commandCtx = {
            client,
            state,
            config,
            logger,
            sessionId: input.sessionID,
            messages,
        }

        const userFocus = (input.arguments || "").trim()
        const prompt = await handleManualTriggerCommand(commandCtx, "compress", userFocus)
        if (!prompt) {
            return undefined
        }

        state.manualMode = "compress-pending"
        state.pendingManualTrigger = {
            sessionId: input.sessionID,
            prompt,
        }
        return {
            text: userFocus ? `/dcp-compress ${userFocus}` : "/dcp-compress",
        }
    }
}

export interface ToolExecuteBeforeEvent {
    tool: string
    sessionID?: string
    messageID?: string
    id?: string
    agent?: string
    input?: unknown
}

export interface ToolExecuteAfterEvent {
    tool: string
    sessionID?: string
    messageID?: string
    id?: string
    agent?: string
    status?: "completed" | "error"
}

/**
 * v2 replacement for the v1 message.part.updated timing hook: measures how long
 * the `compress` tool took and attaches the duration to the block it created.
 */
export function createToolTimingHandlers(state: SessionState, logger: Logger) {
    const before = (event: ToolExecuteBeforeEvent): void => {
        if (event.tool !== "compress") {
            return
        }
        const messageId = String(event.messageID ?? "")
        const callId = String(event.id ?? "")
        if (!messageId || !callId) {
            return
        }
        const key = buildCompressionTimingKey(messageId, callId)
        if (!state.compressionTiming.startsByCallId.has(key)) {
            state.compressionTiming.startsByCallId.set(key, Date.now())
        }
    }

    const after = async (event: ToolExecuteAfterEvent): Promise<void> => {
        if (event.tool !== "compress") {
            return
        }
        const messageId = String(event.messageID ?? "")
        const callId = String(event.id ?? "")
        if (!messageId || !callId) {
            return
        }
        const startedAt = consumeCompressionStart(state, messageId, callId)
        if (typeof startedAt !== "number") {
            return
        }
        const key = buildCompressionTimingKey(messageId, callId)
        state.compressionTiming.pendingByCallId.set(key, {
            messageId,
            callId,
            durationMs: Math.max(0, Date.now() - startedAt),
        })
        const updates = applyPendingCompressionDurations(state)
        if (updates > 0) {
            await saveSessionState(state, logger)
        } else {
            state.compressionTiming.pendingByCallId.delete(key)
        }
    }

    return { before, after }
}
