import * as vscode from 'vscode'

import { LOCAL_APP_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { isOsSupportedByApp } from '../chat/protocol'

import { LOCAL_APP_LOCATIONS } from './LocalAppFsPaths'

/**
 * Watches the Cody app install location and monitors if app is installed and
 * running. This is forked from LocalAppDetector, but the way they work is
 * different:
 *
 * - LocalAppDetector can pick up a token from app, and is hooked into
 *   authorization. LocalAppWatcher does not do auth.
 * - LocalAppDetector has a ratchet from installed, to running, and does not go
 *   backwards. LocalAppWatcher will monitor when app stops running.
 * - LocalAppDetector gives up monitoring app installs if the user is logged in.
 *   LocalAppWatcher continues to monitor app.
 *
 * Note, VScode file watcher can't watch file deletions outside the workspace.
 * So LocalAppWatcher won't flip from installed, to not installed, on deletion.
 * See vscode.workspace.createFileSystemWatcher.
 */
export class LocalAppWatcher implements vscode.Disposable {
    public readonly isSupported: boolean
    private disposed = false
    private disposables: vscode.Disposable[] = []
    private changeEventEmitter = new vscode.EventEmitter<LocalAppWatcher>()
    private _isInstalled = false
    private _isRunning = false

    constructor() {
        // Check if the platform is supported and the user has a home directory
        this.isSupported = isOsSupportedByApp(process.platform, process.arch) && process.env.HOME !== undefined
        void this.init()
    }

    public get isInstalled(): boolean {
        return this._isInstalled
    }

    public get isRunning(): boolean {
        return this._isRunning
    }

    public get onChange(): vscode.Event<LocalAppWatcher> {
        return this.changeEventEmitter.event
    }

    public async init(): Promise<void> {
        // Start with init state
        const homeDir = process.env.HOME
        // if conditions are not met, this will be a noop
        if (!this.isSupported || !homeDir) {
            return
        }
        // Watch the installed app paths
        // TODO: These paths include configuration files which aren't deleted
        // when you remove app (for example, by dragging it to the trash.)
        for (const marker of LOCAL_APP_LOCATIONS[process.platform]) {
            const dirPath = expandHomeDir(marker.dir)
            const dirUri = vscode.Uri.file(dirPath)
            const watchPattern = new vscode.RelativePattern(dirUri, marker.file)
            const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
            this.disposables.push(watcher.onDidChange(() => this.patternChanged()))
            this.disposables.push(watcher)
        }
        await Promise.all([this.patternChanged(), this.pollHttp()])
    }

    private async patternChanged(): Promise<void> {
        const installed = (
            await Promise.all(
                LOCAL_APP_LOCATIONS[process.platform].map(marker =>
                    pathExists(vscode.Uri.file(expandHomeDir(marker.dir) + marker.file).fsPath)
                )
            )
        ).some(id => id)
        if (installed !== this._isInstalled) {
            this._isInstalled = installed
            this.changeEventEmitter.fire(this)
        }
    }

    private async pollHttp(): Promise<void> {
        if (this.disposed) {
            return
        }
        let running = false
        try {
            const response = await fetch(`${LOCAL_APP_URL.href}__version`)
            running = response.status === 200
        } catch {
            running = false
        }
        if (running !== this._isRunning) {
            this._isRunning = running
            this.changeEventEmitter.fire(this)
        }
        setTimeout(() => {
            void this.pollHttp()
        }, 20_000)
    }

    public dispose(): void {
        this.disposed = true
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}

// Utility functions
async function pathExists(path: string): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(vscode.Uri.file(path))
        return true
    } catch {
        return false
    }
}

function expandHomeDir(path: string): string {
    if (process.env.HOME && path.startsWith('~')) {
        return path.replace('~', process.env.HOME)
    }
    return path
}
