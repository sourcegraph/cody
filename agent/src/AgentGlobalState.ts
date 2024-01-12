import type * as vscode from 'vscode'

import { localStorage } from '../../vscode/src/services/LocalStorageProvider'

import * as vscode_shim from './vscode-shim'

/**
 * Implementation of `vscode.ExtensionContext.globalState` with a JSON file
 * that's persisted to disk.
 */
export class AgentGlobalState implements vscode.Memento {
    private globalStorage = new Map<string, any>()

    constructor() {
        // Disable the feature that opens a webview when the user accepts their first
        // autocomplete request.  Removing this line should fail the agent integration
        // tests with the following error message "chat/new: command finished executing
        // without creating a webview" because we reuse the webview when sending
        // chat/new.
        this.globalStorage.set('completion.inline.hasAcceptedFirstCompletion', true)
    }

    public keys(): readonly string[] {
        return [localStorage.LAST_USED_ENDPOINT, localStorage.ANONYMOUS_USER_ID_KEY, ...this.globalStorage.keys()]
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
        return Promise.resolve()
    }

    public setKeysForSync(): void {
        // Not used (yet) by the Cody extension
    }
}
