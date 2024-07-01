import { type IDBPDatabase, openDB } from 'idb'
import type * as vscode from 'vscode'

// Be default cody agent and vscode extension logic internally uses
// Local Storage as a default store to persist chat history and chats
// Since we're running agent in web-worker for cody web we have to use
// Index DB since it's the only store which can be run within Web Worker
export class IndexDBStorage implements vscode.Memento {
    static DATABASE_NAME = 'CODY_CHAT_DATABASE'
    static DATABASE_STORE_NAME = 'GENERIC_KEY_VALUE_TABLE'

    private static IN_MEMORY_STORAGE: Map<string, any> = new Map()

    // IndexDB API is async but vscode memento storage has sync API, to
    // get along with sync interfaces which Cody Agent expects we load
    // all values from index db table beforehand while creating index db storage.
    // Later on each update we write values to IndexDB and update in memory
    // values.
    private static async initialize(db: IDBPDatabase): Promise<Map<string, any>> {
        const store = db
            .transaction(IndexDBStorage.DATABASE_STORE_NAME)
            .objectStore(IndexDBStorage.DATABASE_STORE_NAME)

        let cursor = await store.openCursor()

        while (cursor) {
            IndexDBStorage.IN_MEMORY_STORAGE.set(cursor.key.toString(), cursor.value)

            // Advance the cursor to the next row:
            cursor = await cursor.continue()
        }

        return IndexDBStorage.IN_MEMORY_STORAGE
    }

    static async create(): Promise<IndexDBStorage> {
        try {
            const connection = await openDB(IndexDBStorage.DATABASE_NAME, 1, {
                upgrade(database, oldVersion) {
                    if (oldVersion === 0) {
                        database.createObjectStore(IndexDBStorage.DATABASE_STORE_NAME)
                    }
                },
            })

            await IndexDBStorage.initialize(connection)

            return new IndexDBStorage(connection)
        } catch (error) {
            console.error("Couldn't initiate IndexDB storage", error)
            throw error
        }
    }

    constructor(private db: IDBPDatabase) {}

    keys(): readonly string[] {
        return [...IndexDBStorage.IN_MEMORY_STORAGE.keys()]
    }

    get<T>(key: string, defaultValue?: T): T | undefined {
        return IndexDBStorage.IN_MEMORY_STORAGE.get(key) ?? defaultValue
    }

    async update(key: string, value: any): Promise<void> {
        const store = this.db
            .transaction(IndexDBStorage.DATABASE_STORE_NAME, 'readwrite')
            .objectStore(IndexDBStorage.DATABASE_STORE_NAME)
        await store.put(value, key)

        // Update in memory storage for sync memento get method API
        IndexDBStorage.IN_MEMORY_STORAGE.set(key, value)

        return
    }
}
