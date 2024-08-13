import type * as vscode from 'vscode'

import { localStorage } from '../../../vscode/src/services/LocalStorageProvider'
import * as vscode_shim from '../vscode-shim'
import schema from './schema.sql?raw'

import path from 'node:path'
import Database from 'better-sqlite3'

export class AgentGlobalState implements vscode.Memento {
    private db: DB

    constructor(ide: string, dir?: string) {
        // If not provided, will default to an in-memory database
        if (dir) {
            this.db = new SqliteDB(ide, dir)
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
            case localStorage.ANONYMOUS_USER_ID_KEY:
                return vscode_shim.extensionConfiguration?.anonymousUserID
            case localStorage.LAST_USED_ENDPOINT:
                return vscode_shim.extensionConfiguration?.serverEndpoint
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

class SqliteDB implements DB {
    private db: Database.Database
    private version = 1

    constructor(
        private ide: string,
        dir: string
    ) {
        this.db = new Database(path.join(dir, 'globalState.sqlite'), { timeout: 1000 })
        this.db.exec(schema)
    }

    get(key: string) {
        const stmt = this.db.prepare<SelectParams, Row>(
            'SELECT value FROM global_storage WHERE key = ? AND ide = ? AND version = ?'
        )
        const row = stmt.get(key, this.ide, this.version)
        return row ? JSON.parse(row.value) : undefined
    }

    set(key: string, value: any): void {
        const stmt = this.db.prepare<InsertParams>(
            'INSERT OR REPLACE INTO global_storage (key, value, ide, version) VALUES (?, ?, ?, ?)'
        )
        stmt.run(key, JSON.stringify(value), this.ide, this.version)
    }

    keys(): readonly string[] {
        const stmt = this.db.prepare<KeyParams, Row>(
            'SELECT key FROM global_storage WHERE ide = ? AND version = ?'
        )
        const rows = stmt.all(this.ide, this.version)
        return rows.map(row => row.key)
    }
}

interface Row {
    key: string
    value: string
}

type InsertParams = [string, string, string, number]
type SelectParams = [string, string, number]
type KeyParams = [string, number]
