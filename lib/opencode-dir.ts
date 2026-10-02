import { existsSync, statSync } from "fs"
import { dirname, join } from "path"

export function findOpencodeDir(startDir: string): string | null {
    let current = startDir
    while (current !== "/") {
        const candidate = join(current, ".opencode")
        if (existsSync(candidate)) {
            try {
                if (statSync(candidate).isDirectory()) {
                    return candidate
                }
            } catch {
                // ignore inaccessible entries while walking upward
            }
        }

        const parent = dirname(current)
        if (parent === current) {
            break
        }
        current = parent
    }
    return null
}
