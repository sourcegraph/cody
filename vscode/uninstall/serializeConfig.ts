import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
    type AuthStatus,
    type ClientCapabilitiesWithLegacyFields,
    type ResolvedConfiguration,
    codyPaths,
} from '@sourcegraph/cody-shared'

const CONFIG_FILE = 'config.json'

const getConfigPath = () => path.join(codyPaths().config, CONFIG_FILE)

async function exists(path: string): Promise<boolean> {
    try {
        await fs.stat(path)
        return true
    } catch {
        return false
    }
}

async function ensureDirectoryExists(directory: string) {
    if (!(await exists(directory))) {
        await fs.mkdir(directory, { recursive: true })
    }
}

// Used to cleanup the uninstaller directory after the last telemetry event is sent
export async function deleteUninstallerConfig() {
    return fs.rm(getConfigPath())
}

async function writeSnapshot(
    directory: string,
    filename: string,
    content: UninstallerConfig
): Promise<void> {
    const filePath = path.join(directory, filename)

    return fs.writeFile(filePath, JSON.stringify(content, null, 2))
}

interface UninstallerConfig {
    config?: ResolvedConfiguration
    authStatus: AuthStatus | undefined
    clientCapabilities?: ClientCapabilitiesWithLegacyFields
    version?: string
}

/**
 * Serializes the current configuration and auth status to disk. This is used in the case
 * of an uninstall event to log one last telemetry event.
 */
export async function serializeConfigSnapshot(uninstall: UninstallerConfig) {
    const directory = codyPaths().config
    await ensureDirectoryExists(directory)
    await writeSnapshot(directory, CONFIG_FILE, uninstall)
}

export async function readConfig(): Promise<UninstallerConfig | null> {
    const file = getConfigPath()

    if (!(await exists(file))) {
        return null
    }

    const obj = await fs.readFile(file, 'utf-8')
    return JSON.parse(obj)
}
