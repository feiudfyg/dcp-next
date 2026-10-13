export type PermissionAction = "ask" | "allow" | "deny"

export type PermissionValue = PermissionAction | Record<string, PermissionAction>

export type PermissionConfig = Record<string, PermissionValue> | undefined

export interface HostPermissionSnapshot {
    global: PermissionConfig
    agents: Record<string, PermissionConfig>
}

type PermissionRule = {
    permission: string
    pattern: string
    action: PermissionAction
}

const findLastMatchingRule = (
    rules: PermissionRule[],
    predicate: (rule: PermissionRule) => boolean,
): PermissionRule | undefined => {
    for (let index = rules.length - 1; index >= 0; index -= 1) {
        const rule = rules[index]
        if (rule && predicate(rule)) {
            return rule
        }
    }

    return undefined
}

const wildcardMatch = (value: string, pattern: string): boolean => {
    const normalizedValue = value.replaceAll("\\", "/")
    let escaped = pattern
        .replaceAll("\\", "/")
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".")

    if (escaped.endsWith(" .*")) {
        escaped = escaped.slice(0, -3) + "( .*)?"
    }

    const flags = process.platform === "win32" ? "si" : "s"
    return new RegExp(`^${escaped}$`, flags).test(normalizedValue)
}

const getPermissionRules = (permissionConfigs: PermissionConfig[]): PermissionRule[] => {
    const rules: PermissionRule[] = []
    for (const permissionConfig of permissionConfigs) {
        if (!permissionConfig) {
            continue
        }

        for (const [permission, value] of Object.entries(permissionConfig)) {
            if (value === "ask" || value === "allow" || value === "deny") {
                rules.push({ permission, pattern: "*", action: value })
                continue
            }

            for (const [pattern, action] of Object.entries(value)) {
                if (action === "ask" || action === "allow" || action === "deny") {
                    rules.push({ permission, pattern, action })
                }
            }
        }
    }
    return rules
}

export const compressDisabledByOpencode = (...permissionConfigs: PermissionConfig[]): boolean => {
    const match = findLastMatchingRule(getPermissionRules(permissionConfigs), (rule) =>
        wildcardMatch("compress", rule.permission),
    )

    return match?.pattern === "*" && match.action === "deny"
}

export const resolveEffectiveCompressPermission = (
    basePermission: PermissionAction,
    hostPermissions: HostPermissionSnapshot,
    agentName?: string,
): PermissionAction => {
    if (basePermission === "deny") {
        return "deny"
    }

    return compressDisabledByOpencode(
        hostPermissions.global,
        agentName ? hostPermissions.agents[agentName] : undefined,
    )
        ? "deny"
        : basePermission
}

export const hasExplicitToolPermission = (
    permissionConfig: PermissionConfig,
    tool: string,
): boolean => {
    return permissionConfig ? Object.prototype.hasOwnProperty.call(permissionConfig, tool) : false
}

export interface HostAgentPermission {
    action: string
    resource?: string
    effect: string
}

export interface HostAgent {
    id?: string
    permissions?: ReadonlyArray<HostAgentPermission>
}

/**
 * Convert OpenCode v2 agent permission entries (`{action, resource, effect}`)
 * into the v1-shaped `PermissionConfig` this module already understands.
 */
export const buildHostPermissionConfig = (
    permissions: ReadonlyArray<HostAgentPermission> | undefined,
): PermissionConfig => {
    if (!permissions || permissions.length === 0) {
        return undefined
    }

    const config: Record<string, PermissionValue> = {}
    for (const permission of permissions) {
        if (
            permission.effect !== "ask" &&
            permission.effect !== "allow" &&
            permission.effect !== "deny"
        ) {
            continue
        }
        const resource = permission.resource ?? "*"
        if (resource === "*") {
            config[permission.action] = permission.effect
            continue
        }
        const existing = config[permission.action]
        if (existing && typeof existing === "object") {
            existing[resource] = permission.effect
        } else {
            config[permission.action] = { [resource]: permission.effect }
        }
    }

    return Object.keys(config).length > 0 ? config : undefined
}

export const buildHostPermissionSnapshot = (
    agents: ReadonlyArray<HostAgent>,
): HostPermissionSnapshot => {
    const snapshot: HostPermissionSnapshot = { global: undefined, agents: {} }
    for (const agent of agents) {
        if (!agent?.id) {
            continue
        }
        const config = buildHostPermissionConfig(agent.permissions)
        if (config) {
            snapshot.agents[agent.id] = config
        }
    }
    return snapshot
}
