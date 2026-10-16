/**
 * Marker for DCP's own user-facing notifications.
 *
 * DCP delivers notifications as session messages on hosts without a toast
 * channel (OpenCode v2 `session.synthetic`). Those messages persist in the
 * transcript and would otherwise be re-sent to the model on every turn, so they
 * are recognised here and excluded from the outgoing request.
 */
export const DCP_NOTIFICATION_PREFIX = "▣ DCP |"

export function isDcpNotificationText(text: string): boolean {
    if (typeof text !== "string") {
        return false
    }
    const trimmed = text.replace(/^\s+/, "")
    return trimmed.startsWith(DCP_NOTIFICATION_PREFIX) || trimmed.startsWith("DCP | ")
}
