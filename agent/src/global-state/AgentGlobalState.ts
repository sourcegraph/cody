import type * as vscode from 'vscode'

import { LocalStorage } from 'node-localstorage'
import * as vscode_shim from '../vscode-shim'

import path from 'node:path'
import { localStorage } from '../../../vscode/src/services/LocalStorageProvider'

export class AgentGlobalState implements vscode.Memento {
    private db: DB

    constructor(ide: string, dir?: string) {
        // If not provided, will default to an in-memory database
        if (dir) {
            this.db = new LocalStorageDB(ide, dir)
        } else {
            this.db = new InMemoryDB()
        }

        // Set default values
        this.set('notification.setupDismissed', 'true')
        this.set('completion.inline.hasAcceptedFirstCompletion', true)
        this.set('extension.hasActivatedPreviously', 'true')
    }

    private set(key: string, value: any): void {
        this.db.set(key, value)
    }

    public reset(): void {
        if (this.db instanceof InMemoryDB) {
            this.db.clear()
        }
    }

    public keys(): readonly string[] {
        return [localStorage.LAST_USED_ENDPOINT, localStorage.ANONYMOUS_USER_ID_KEY, ...this.db.keys()]
    }

    public get<T>(key: string, defaultValue?: unknown): any {
        switch (key) {
            case localStorage.LAST_USED_ENDPOINT:
                return vscode_shim.extensionConfiguration?.serverEndpoint
            case localStorage.ANONYMOUS_USER_ID_KEY:
                // biome-ignore lint/suspicious/noFallthroughSwitchClause: This is intentional
                if (vscode_shim.extensionConfiguration?.anonymousUserID) {
                    return vscode_shim.extensionConfiguration?.anonymousUserID
                }
            default:
                return this.db.get(key) ?? defaultValue
        }
    }

    public update(key: string, value: any): Promise<void> {
        this.set(key, value)
        return Promise.resolve()
    }

    public setKeysForSync(): void {
        // Not used (yet) by the Cody extension
    }
}

interface DB {
    get(key: string): any
    set(key: string, value: any): void
    keys(): readonly string[]
}

class InMemoryDB implements DB {
    private store = new Map<string, any>()

    get(key: string): any {
        return this.store.get(key)
    }

    set(key: string, value: any): void {
        this.store.set(key, value)
    }

    keys(): readonly string[] {
        return [...this.store.keys()]
    }

    clear() {
        this.store.clear()
    }
}

class LocalStorageDB implements DB {
    storage: LocalStorage

    constructor(ide: string, dir: string) {
        this.storage = new LocalStorage(path.join(dir, `${ide}-globalState`))
    }

    get(key: string): any {
        const item = this.storage.getItem(key)
        return item ? JSON.parse(item) : undefined
    }
    set(key: string, value: any): void {
        this.storage.setItem(key, JSON.stringify(value))
    }
    keys(): readonly string[] {
        const keys = []
        for (let i = 0; i < this.storage.length; i++) {
            keys.push(this.storage.key(i))
        }

        return keys
    }
}
