import type { Context } from "@opencode/plugin/promise/plugin"

/**
 * OpenCode v2 exposes the plugin context as both a server client and the
 * extension API. Domain methods (session, permission, tool, ...) live directly
 * on the context object rather than behind a separate `client` property.
 */
export type PluginContext = Context

/** Backwards-compatible alias retained across the codebase during the v2 port. */
export type SdkClient = PluginContext
