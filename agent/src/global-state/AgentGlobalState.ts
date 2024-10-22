import type * as vscode from 'vscode'

import { LocalStorage } from 'node-localstorage'
import * as vscode_shim from '../vscode-shim'

import path from 'node:path'
import { localStorage } from '../../../vscode/src/services/LocalStorageProvider'
import migrate from './migrations/migrate'

type GlobalStateManager = 'client' | 'server'

export class AgentGlobalState implements vscode.Memento {
    private db: DB

    static async initialize(ide: string, dir?: string): Promise<AgentGlobalState> {
        const globalState = new AgentGlobalState(ide, dir ? 'server' : 'client', dir)
        if (globalState.db instanceof LocalStorageDB) {
            await migrate(globalState)
        }
        return globalState
    }

    private constructor(
        ide: string,
        private manager: GlobalStateManager,
        dir?: string
    ) {
        // If not provided, will default to an in-memory database
        if (dir) {
            this.db = new LocalStorageDB(ide, dir)
        } else {
            this.db = new InMemoryDB()
        }

        if (manager === 'client') {
            // Set default values
            this.set('notification.setupDismissed', 'true')
            this.set('completion.inline.hasAcceptedFirstCompletion', true)
            this.set('extension.hasActivatedPreviously', 'true')
        }
    }

    private set(key: string, value: any): void {
        this.db.set(key, value)
    }

    public async reset(): Promise<void> {
        this.db.clear()

        // HACK(sqs): Force `localStorage` to fire a change event.
        await localStorage.delete('')
    }

    public keys(): readonly string[] {
        if (this.manager === 'server') {
            return this.db.keys()
        }
        return [localStorage.LAST_USED_ENDPOINT, localStorage.ANONYMOUS_USER_ID_KEY, ...this.db.keys()]
    }

    public get<T>(key: string, defaultValue?: T): T {
        if (this.manager === 'server') {
            return this.db.get(key) ?? defaultValue
        }
        switch (key) {
            case localStorage.LAST_USED_ENDPOINT:
                return vscode_shim.extensionConfiguration?.serverEndpoint as T
            case localStorage.ANONYMOUS_USER_ID_KEY:
                // biome-ignore lint/suspicious/noFallthroughSwitchClause: This is intentional
                if (vscode_shim.extensionConfiguration?.anonymousUserID) {
                    return vscode_shim.extensionConfiguration?.anonymousUserID as T
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
    get(key: string): any | undefined
    set(key: string, value: any): void
    keys(): readonly string[]
    clear(): void
}

class InMemoryDB implements DB {
    private store = new Map<string, any>()

    get(key: string): any | undefined {
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

export class LocalStorageDB implements DB {
    storage: LocalStorage

    constructor(ide: string, dir: string) {
        const quota = 1024 * 1024 * 256 // 256 MB
        this.storage = new LocalStorage(path.join(dir, `${ide}-globalState`), quota)
    }
    clear() {
        this.storage.clear()
    }

    get(key: string): any | undefined {
        const item = this.storage.getItem(key)
        try {
            return item ? JSON.parse(item) : undefined
        } catch (error) {
            // That should never happen now, but in past it was possible to store incorrectly serialized
            // undefined values, which were failing to deserialize during the get operation
            this.storage.removeItem(key)
            return undefined
        }
    }
    set(key: string, value: any): void {
        if (value) {
            this.storage.setItem(key, JSON.stringify(value))
        } else {
            this.storage.removeItem(key)
        }
    }
    keys(): readonly string[] {
        const keys = []
        for (let i = 0; i < this.storage.length; i++) {
            keys.push(this.storage.key(i))
        }

        return keys
    }
}
