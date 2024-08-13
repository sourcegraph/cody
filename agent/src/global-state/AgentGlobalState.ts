import type * as vscode from 'vscode'

import { localStorage } from '../../../vscode/src/services/LocalStorageProvider'
import * as vscode_shim from '../vscode-shim'
import schema from './schema.sql'

import path from 'node:path'
import Database from 'better-sqlite3'

// Implementation of `vscode.ExtensionContext.globalState` that's persisted to sqlite.
export class AgentGlobalState implements vscode.Memento {
    private db: Database.Database
    private version = 1
    private path = ':memory:'

    constructor(
        private ide: string,
        dir?: string
    ) {
        // If not provided, will default to an in-memory database
        if (dir) {
            this.path = path.join(dir, 'globalState.sqlite')
        }

        this.db = new Database(this.path, { timeout: 1000 })
        this.initializeDatabase()

        // Set default values
        this.set('notification.setupDismissed', 'true')
        this.set('completion.inline.hasAcceptedFirstCompletion', true)
        this.set('extension.hasActivatedPreviously', 'true')
    }

    private initializeDatabase(): void {
        this.db.exec(schema)
    }

    private set(key: string, value: any): void {
        const stmt = this.db.prepare<InsertParams>(
            'INSERT OR REPLACE INTO global_storage (key, value, ide, version) VALUES (?, ?, ?, ?)'
        )
        stmt.run(key, JSON.stringify(value), this.ide, this.version)
    }

    public reset(): void {
        if (this.path === ':memory:') {
            this.db.exec('DELETE FROM global_storage')
        }
    }

    public keys(): readonly string[] {
        const stmt = this.db.prepare<KeyParams, Row>(
            'SELECT key FROM global_storage WHERE ide = ? AND version = ?'
        )
        const rows = stmt.all(this.ide, this.version)
        return [
            localStorage.LAST_USED_ENDPOINT,
            localStorage.ANONYMOUS_USER_ID_KEY,
            ...rows.map(row => row.key),
        ]
    }

    public get<T>(key: string, defaultValue?: unknown): any {
        switch (key) {
            case localStorage.ANONYMOUS_USER_ID_KEY:
                return vscode_shim.extensionConfiguration?.anonymousUserID
            case localStorage.LAST_USED_ENDPOINT:
                return vscode_shim.extensionConfiguration?.serverEndpoint
            default: {
                const stmt = this.db.prepare<SelectParams, Row>(
                    'SELECT value FROM global_storage WHERE key = ? AND ide = ? AND version = ?'
                )
                const row = stmt.get(key, this.ide, this.version)
                return row ? JSON.parse(row.value) : defaultValue
            }
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

interface Row {
    key: string
    value: string
}

type InsertParams = [string, string, string, number]
type SelectParams = [string, string, number]
type KeyParams = [string, number]
