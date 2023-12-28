import * as vscode from 'vscode'

import { LOCAL_APP_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { version } from '../../package.json'
import { LocalEnv } from '../chat/protocol'
import { constructFileUri } from '../commands/utils/helpers'
import { fetch } from '../fetch'
import { logDebug, logError } from '../log'

import { LOCAL_APP_LOCATIONS } from './LocalAppFsPaths'

type OnChangeCallback = (type: string) => Promise<void>

// The  OS and Arch support for Cody app
function isOsSupportedByApp(os?: string, arch?: string): boolean {
    if (!os || !arch) {
        return false
    }
    return os === 'darwin' || os === 'linux'
}

/**
 * Detects whether the user has the Sourcegraph app installed locally.
 */
export class LocalAppDetector implements vscode.Disposable {
    // Check if the platform is supported and the user has a home directory
    private isSupported = false

    private localAppMarkers
    private appFsPaths: string[] = []

    private _watchers: vscode.Disposable[] = []
    private onChange: OnChangeCallback

    constructor(options: { onChange: OnChangeCallback }) {
        this.onChange = options.onChange
        const env = getProcessInfo()
        this.localAppMarkers = LOCAL_APP_LOCATIONS[env.os]
        this.isSupported = isOsSupportedByApp(env.os, env.arch) && env.homeDir !== undefined
    }

    public async getProcessInfo(isLoggedIn = false): Promise<void> {
        if (isLoggedIn && this._watchers.length > 0) {
            this.dispose()
        }
        await this.fetchServer()
    }

    public async init(): Promise<void> {
        // Start with init state
        this.dispose()
        logDebug('LocalAppDetector', 'initializing')
        const homeDir = getProcessInfo().homeDir
        // if conditions are not met, this will be a noop
        if (!this.isSupported || !homeDir) {
            logError('LocalAppDetector:init:failed', 'osNotSupported')
            return
        }
        // Create filePaths and file watchers
        const markers = this.localAppMarkers
        for (const marker of markers) {
            const dirPath = expandHomeDir(marker.dir, homeDir)
            const fileUri = constructFileUri(marker.file, marker.dir)
            if (!fileUri) {
                return
            }
            const watchPattern = new vscode.RelativePattern(fileUri, '*')
            const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
            watcher.onDidChange(() => this.fetchApp())
            this._watchers.push(watcher)
            this.appFsPaths.push(dirPath + marker.file)
        }
        await this.fetchApp()
    }

    // Check if App is installed
    private async fetchApp(): Promise<void> {
        if (!this.appFsPaths) {
            return
        }
        if (await Promise.any(this.appFsPaths.map(file => pathExists(vscode.Uri.file(file))))) {
            this.appFsPaths = []
            await this.found('app')
            return
        }
    }

    // Check if App is running
    private async fetchServer(): Promise<void> {
        try {
            const response = await fetch(`${LOCAL_APP_URL.href}__version`)
            if (response.status === 200) {
                await this.found('server')
            }
        } catch {
            return
        }
    }

    // Notify the caller that the app has been found
    // NOTE: Call this function only when the app is found
    private async found(type: 'app' | 'server'): Promise<void> {
        await this.onChange(type)
        logDebug('LocalAppDetector:found', type)
    }

    // We can dispose the file watcher when app is found or when user has logged in
    public dispose(): void {
        for (const watcher of this._watchers) {
            watcher.dispose()
        }
        this._watchers = []
        this.appFsPaths = []
    }
}

// Utility functions
export async function pathExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(uri)
        return true
    } catch {
        return false
    }
}

export function expandHomeDir(path: string, homeDir: string | null | undefined): string {
    if (homeDir && path.startsWith('~/')) {
        return path.replace('~', homeDir)
    }
    return path
}

const envInit: LocalEnv = {
    arch: process.arch,
    os: process.platform,
    homeDir: process.env.HOME,

    extensionVersion: version,

    uiKindIsWeb: vscode.env.uiKind === vscode.UIKind.Web,
}

export function getProcessInfo(): LocalEnv {
    return { ...envInit }
}
