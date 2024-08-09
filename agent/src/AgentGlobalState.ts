import * as fs from 'node:fs'
import type * as vscode from 'vscode'

import { localStorage } from '../../vscode/src/services/LocalStorageProvider'

import { logError } from '../../vscode/src/log'
import * as vscode_shim from './vscode-shim'

/**
 * Implementation of `vscode.ExtensionContext.globalState` with a JSON file
 * that's persisted to disk.
 */
export class AgentGlobalState implements vscode.Memento {
    private globalStorage = new Map<string, any>()
    private path: string | null = null

    constructor() {
        // Disable the feature that opens a webview when the user accepts their first
        // autocomplete request.  Removing this line should fail the agent integration
        // tests with the following error message "chat/new: command finished executing
        // without creating a webview" because we reuse the webview when sending
        // chat/new.
        this.globalStorage.set('notification.setupDismissed', 'true')
        this.globalStorage.set('completion.inline.hasAcceptedFirstCompletion', true)
        this.globalStorage.set('extension.hasActivatedPreviously', 'true')
    }

    public setPersistencePath(path: string): void {
        this.path = path
        const storage = this.readFromDisk(path)
        for (const [key, value] of storage ?? []) {
            if (this.globalStorage.has(key) && this.globalStorage.get(key) !== value) {
                throw new Error(
                    `Global state key ${key} already exists with a different value: (local) ${this.globalStorage.get(
                        key
                    )}, (disk) ${value}`
                )
            }
            this.globalStorage.set(key, value)
        }
    }

    // Write the contents of the globalStorage to the file at `this.path`
    // in a format that can be deserialized later back into a Map.
    private syncToDisk(): void {
        if (this.path) {
            const json = JSON.stringify([...this.globalStorage])
            fs.writeFileSync(this.path, json)
        }
    }

    // deserialize the contents of the file at `this.path` into the globalStorage
    private readFromDisk(path: string): Map<string, any> | undefined {
        try {
            const json = fs.readFileSync(path, 'utf8')
            const entries = JSON.parse(json)
            return new Map(entries)
        } catch (e) {
            logError('AgentGlobalState', 'Failed to read global state from disk', String(e))
            return undefined
        }
    }

    public reset(): void {
        this.globalStorage.clear()
        if (this.path) {
            fs.truncateSync(this.path)
        }
    }

    public keys(): readonly string[] {
        return [
            localStorage.LAST_USED_ENDPOINT,
            localStorage.ANONYMOUS_USER_ID_KEY,
            ...this.globalStorage.keys(),
        ]
    }

    public get<T>(key: string, defaultValue?: unknown): any {
        switch (key) {
            case localStorage.ANONYMOUS_USER_ID_KEY:
                return vscode_shim.extensionConfiguration?.anonymousUserID
            case localStorage.LAST_USED_ENDPOINT:
                return vscode_shim.extensionConfiguration?.serverEndpoint
            default:
                return this.globalStorage.get(key) ?? defaultValue
        }
    }

    public update(key: string, value: any): Promise<void> {
        this.globalStorage.set(key, value)
        this.syncToDisk()
        return Promise.resolve()
    }

    public setKeysForSync(): void {
        // Not used (yet) by the Cody extension
    }
}
