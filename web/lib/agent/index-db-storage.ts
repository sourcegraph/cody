import { type IDBPDatabase, openDB } from 'idb'
import type * as vscode from 'vscode'

export class IndexDBStorage implements vscode.Memento {
    static DATABASE_NAME = 'CODY_CHAT_DATABASE'
    static DATABASE_STORE_NAME = 'GENERIC_KEY_VALUE_TABLE'

    static async create(): Promise<IndexDBStorage> {
        try {
            const connection = await openDB(IndexDBStorage.DATABASE_NAME, 1, {
                upgrade(database, oldVersion) {
                    if (oldVersion === 0) {
                        database.createObjectStore(IndexDBStorage.DATABASE_STORE_NAME)
                    }
                },
            })

            return new IndexDBStorage(connection)
        } catch (error) {
            console.error("Couldn't initiate IndexDB storage", error)
            throw error
        }
    }

    constructor(private db: IDBPDatabase) {}

    keys(): readonly string[] {
        return []
    }

    async get(key: string, defaultValue?: any): Promise<any> {
        const store = this.db
            .transaction(IndexDBStorage.DATABASE_STORE_NAME)
            .objectStore(IndexDBStorage.DATABASE_STORE_NAME)
        const result = await store.get(key)

        return result ?? defaultValue
    }

    async update(key: string, value: any): Promise<void> {
        const store = this.db
            .transaction(IndexDBStorage.DATABASE_STORE_NAME, 'readwrite')
            .objectStore(IndexDBStorage.DATABASE_STORE_NAME)
        await store.put(value, key)

        return
    }
}
