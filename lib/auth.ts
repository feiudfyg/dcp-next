import type { Logger } from "./logger"

export function isSecureMode(): boolean {
    return !!process.env.OPENCODE_SERVER_PASSWORD
}

export function getAuthorizationHeader(): string | undefined {
    const password = process.env.OPENCODE_SERVER_PASSWORD
    if (!password) return undefined

    const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode"
    // Use Buffer for Node.js base64 encoding (btoa may not be available in all Node versions)
    const credentials = Buffer.from(`${username}:${password}`).toString("base64")
    return `Basic ${credentials}`
}

export function configureClientAuth(client: any, logger?: Logger): any {
    const authHeader = getAuthorizationHeader()

    if (!authHeader) {
        return client
    }

    // The SDK client exposes its underlying transport under a private field whose
    // name has changed across versions, so probe both known shapes defensively.
    const innerClient = client?._client ?? client?.client

    if (!innerClient) {
        logger?.warn(
            "Secure mode is enabled but the SDK client transport could not be located; requests may be unauthenticated.",
            {},
        )
        return client
    }

    if (typeof innerClient?.interceptors?.request?.use !== "function") {
        logger?.warn(
            "Secure mode is enabled but the SDK client transport has no request interceptor; requests may be unauthenticated.",
            {},
        )
        return client
    }

    innerClient.interceptors.request.use((request: Request) => {
        // Only add auth header if not already present
        if (!request.headers.has("Authorization")) {
            request.headers.set("Authorization", authHeader)
        }
        return request
    })

    return client
}
