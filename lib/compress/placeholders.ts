export const PRUNED_COMPRESS_ARGS_REPLACEMENT =
    "[compress call args removed - summary is now the active [Compressed conversation section]]"

const PLACEHOLDER_MARKER = "compress call args removed"

export function isPrunedCompressArgsPlaceholder(text: unknown): boolean {
    return typeof text === "string" && text.includes(PLACEHOLDER_MARKER)
}
