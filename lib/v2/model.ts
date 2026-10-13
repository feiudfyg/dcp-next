import type { PluginContext } from "../sdk-types"

/** Resolve the usable context window for the model issuing the current request. */
export async function resolveModelContextLimit(
    ctx: PluginContext,
    providerID?: string,
    modelID?: string,
): Promise<number | undefined> {
    try {
        const models = (await ctx.model.list()) as unknown as Array<Record<string, any>>
        for (const model of models) {
            if (providerID && model.providerID !== providerID) {
                continue
            }
            if (modelID && model.id !== modelID) {
                continue
            }
            const limit = model?.limit?.context
            if (typeof limit === "number") {
                return limit
            }
        }
    } catch {
        // Model catalog unavailable; DCP falls back to configured percentage limits.
    }
    return undefined
}
