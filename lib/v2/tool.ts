import type { ToolEditor } from "@opencode/plugin/promise/tool"

/** A tool definition accepted by `ctx.tool.transform((editor) => editor.add(...))`. */
export type DcpToolDefinition = Parameters<ToolEditor["add"]>[0]
