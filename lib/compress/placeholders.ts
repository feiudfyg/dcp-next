export const PRUNED_COMPRESS_ARGS_REPLACEMENT =
    "[compress call args hidden in this view to save space; the stored summary is the [Compressed conversation section] shown above]"

const PLACEHOLDER_MARKER = "compress call args hidden"

export function isPrunedCompressArgsPlaceholder(text: unknown): boolean {
    return typeof text === "string" && text.includes(PLACEHOLDER_MARKER)
}
