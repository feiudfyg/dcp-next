export function formatTokenAmount(tokens: number): string {
    const value = Math.abs(tokens)
    if (value >= 1000) {
        return `${(value / 1000).toFixed(1)}K`.replace(".0K", "K")
    }
    return value.toString()
}

export function formatSignedTokenAmount(netRemovedTokens: number): string {
    const sign = netRemovedTokens >= 0 ? "-" : "+"
    return `${sign}${formatTokenAmount(netRemovedTokens)}`
}
