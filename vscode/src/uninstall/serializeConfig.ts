import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import type {
    AuthStatus,
    ClientConfigurationWithAccessToken,
    ExtensionDetails,
} from '@sourcegraph/cody-shared'

import { Platform, getOSArch } from '../os'

const CONFIG_FILE = 'config.json'

function getPlatformSpecificDirectory(): string {
    const { platform } = getOSArch()
    const appName = 'cody-ai'

    switch (platform) {
        case Platform.Windows:
            return path.join(process.env.APPDATA || os.homedir(), appName)
        case Platform.Mac:
        case Platform.Linux:
            return path.join(os.homedir(), '.config', appName)
        default:
            throw new Error(`Unsupported platform: ${platform}`)
    }
}

function ensureDirectoryExists(directory: string) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true })
    }
}

// Used to cleanup the uninstaller directory after the last telemetry event is sent
export function deleteUninstallerDirectory() {
    fs.rmdirSync(getPlatformSpecificDirectory(), { recursive: true })
}

function writeSnapshot(directory: string, filename: string, content: any) {
    const filePath = path.join(directory, filename)

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2))
}

interface UninstallerConfig {
    config?: ClientConfigurationWithAccessToken
    authStatus?: AuthStatus
    extensionDetails: ExtensionDetails
    anonymousUserID: string
}

/**
 * Serializes the current configuration and auth status to disk. This is used in the case
 * of an uninstall event to log one last telemetry event.
 */
export function serializeConfigSnapshot(uninstall: UninstallerConfig) {
    const directory = getPlatformSpecificDirectory()
    ensureDirectoryExists(directory)
    writeSnapshot(directory, CONFIG_FILE, uninstall)
}

export function readConfig(): UninstallerConfig | null {
    const file = path.join(getPlatformSpecificDirectory(), CONFIG_FILE)

    if (!fs.existsSync(file)) {
        return null
    }

    const obj = fs.readFileSync(file, 'utf-8')
    return JSON.parse(obj)
}
