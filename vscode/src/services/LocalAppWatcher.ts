import * as vscode from 'vscode'

import { LOCAL_APP_URL } from '@sourcegraph/cody-shared/src/sourcegraph-api/environments'

import { isOsSupportedByApp } from '../chat/protocol'

import { expandHomeDir, pathExists } from './LocalAppDetector'
import { LOCAL_APP_LOCATIONS } from './LocalAppFsPaths'

/**
 * Watches the Cody app install location and monitors if app is installed and
 * running. This is forked from LocalAppDetector, but the way they work is
 * different:
 *
 * - LocalAppDetector can pick up a token from app, and is hooked into
 *   authorization. LocalAppWatcher can watch the token file, but relies on
 *   LocalAppDetector to extract and store tokens.
 * - LocalAppDetector has a ratchet from installed, to running, and does not go
 *   backwards. LocalAppWatcher will monitor when app stops running and can
 *   transition from "running" back to just "installed."
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
    private tokenFileChangeEventEmitter = new vscode.EventEmitter<vscode.Uri>()
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

    public get onTokenFileChange(): vscode.Event<vscode.Uri> {
        return this.tokenFileChangeEventEmitter.event
    }

    private async init(): Promise<void> {
        // Start with init state
        const homeDir = process.env.HOME
        // if conditions are not met, this will be a noop
        if (!this.isSupported || !homeDir) {
            return
        }
        // Watch the installed app paths
        // TODO: These paths include configuration files which aren't deleted
        // when you remove app (for example, by dragging it to the trash.)
        const pollPromise = this.pollHttp()
        for (const marker of LOCAL_APP_LOCATIONS[process.platform]) {
            const dirPath = expandHomeDir(marker.dir, process.env.HOME)
            const dirUri = vscode.Uri.file(dirPath)
            const fileUri = dirUri.with({ path: dirUri.path + marker.file })
            const watchPattern = new vscode.RelativePattern(dirUri, marker.file)
            const watcher = vscode.workspace.createFileSystemWatcher(watchPattern)
            const fireEvent = (): void => this.patternChanged(fileUri, !!marker.hasToken)
            this.disposables.push(watcher.onDidCreate(fireEvent))
            this.disposables.push(watcher.onDidChange(fireEvent))
            this.disposables.push(watcher.onDidDelete(fireEvent))
            this.disposables.push(watcher)
            fireEvent()
        }
        await pollPromise
    }

    private patternChanged(file: vscode.Uri, fileMayHaveToken: boolean): void {
        this.setNeedsToCheckFiles()
        if (fileMayHaveToken) {
            this.tokenFileChangeEventEmitter.fire(file)
        }
    }

    private needsToCheckFiles = false

    private setNeedsToCheckFiles(): void {
        if (this.needsToCheckFiles) {
            return
        }
        this.needsToCheckFiles = true
        void this.checkFiles()
    }

    private async checkFiles(): Promise<void> {
        this.needsToCheckFiles = false
        let installed = false
        for (const marker of LOCAL_APP_LOCATIONS[process.platform]) {
            const dirPath = expandHomeDir(marker.dir, process.env.HOME)
            const dirUri = vscode.Uri.file(dirPath)
            const fileUri = dirUri.with({ path: dirUri.path + marker.file })
            installed ||= await pathExists(fileUri)
            if (installed) {
                break
            }
        }
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
