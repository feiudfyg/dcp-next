import { Plugin } from "@opencode/plugin"
import { getConfig } from "./lib/config"
import { createCompressMessageTool, createCompressRangeTool } from "./lib/compress"
import { Logger } from "./lib/logger"
import { createSessionState } from "./lib/state"
import { PromptStore } from "./lib/prompts/store"
import { createCompressCommandExecutor, createContextHookHandler } from "./lib/hooks"
import { type HostPermissionSnapshot } from "./lib/host-permissions"
import type { Notify } from "./lib/ui/notification"

export default Plugin.define({
    id: "opencode-dcp",
    async setup(context) {
        const config = getConfig({ directory: context.location.directory })

        if (!config.enabled) {
            return
        }

        const logger = new Logger(config.debug)
        const state = createSessionState()
        const prompts = new PromptStore(
            logger,
            context.location.directory,
            config.experimental.customPrompts,
        )
        const hostPermissions: HostPermissionSnapshot = {
            global: undefined,
            agents: {},
        }
        const notify: Notify = {
            message: (sessionID, text) => {
                void context.session.synthetic({ sessionID, text })
            },
        }

        logger.info("DCP initialized", {
            strategies: config.strategies,
        })

        await context.session.hook(
            "context",
            createContextHookHandler(context, state, logger, config, prompts, hostPermissions),
        )

        await context.tool.transform((editor) => {
            if (config.compress.permission === "deny") {
                return
            }
            const toolCtx = {
                client: context,
                state,
                logger,
                config,
                prompts,
                notify,
            }
            editor.add(
                config.compress.mode === "message"
                    ? createCompressMessageTool(toolCtx)
                    : createCompressRangeTool(toolCtx),
            )
        })

        if (config.commands.enabled && config.compress.permission !== "deny") {
            const executeCommand = createCompressCommandExecutor(
                context,
                state,
                logger,
                config,
                context.location.directory,
                hostPermissions,
            )
            await context.command.transform((editor) => {
                editor.add({
                    name: "dcp-compress",
                    description: "Trigger DCP manual compression with: /dcp-compress [focus]",
                    execute: async ({ sessionID, prompt }) => {
                        const result = await executeCommand({
                            sessionID,
                            arguments: prompt?.text ?? "",
                        })
                        if (result) {
                            await context.session.prompt({
                                sessionID,
                                text: result.text,
                            })
                        }
                    },
                })
            })
        }

        await context.permission.hook("evaluate", (event) => {
            if (config.compress.permission === "deny") {
                return
            }
            if (event.action === "compress") {
                event.effect = config.compress.permission
            }
        })
    },
})
