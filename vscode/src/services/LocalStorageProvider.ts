import * as uuid from 'uuid'
import { Memento } from 'vscode'

import { UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

export class LocalStorage {
    // Bump this on storage changes so we don't handle incorrectly formatted data
    protected KEY_LOCAL_HISTORY = 'cody-local-chatHistory-v2'
    protected ANONYMOUS_USER_ID_KEY = 'sourcegraphAnonymousUid'
    protected LAST_USED_ENDPOINT = 'SOURCEGRAPH_CODY_ENDPOINT'
    protected CODY_ENDPOINT_HISTORY = 'SOURCEGRAPH_CODY_ENDPOINT_HISTORY'
    protected KEY_ENABLED_PLUGINS = 'KEY_ENABLED_PLUGINS'
    protected KEY_LAST_USED_RECIPES = 'SOURCEGRAPH_CODY_LAST_USED_RECIPE_NAMES'

    /**
     * Should be set on extension activation via `localStorage.setStorage(context.globalState)`
     * Done to avoid passing the local storage around as a parameter and instead
     * access it as a singleton via the module import.
     */
    private _storage: Memento | null = null

    private get storage(): Memento {
        if (!this._storage) {
            throw new Error('LocalStorage not initialized')
        }

        return this._storage
    }

    public setStorage(storage: Memento): void {
        this._storage = storage
    }

    public getEndpoint(): string | null {
        return this.storage.get<string | null>(this.LAST_USED_ENDPOINT, null)
    }

    public async saveEndpoint(endpoint: string): Promise<void> {
        if (!endpoint) {
            return
        }
        try {
            const uri = new URL(endpoint).href
            await this.storage.update(this.LAST_USED_ENDPOINT, uri)
            await this.addEndpointHistory(uri)
        } catch (error) {
            console.error(error)
        }
    }

    public async deleteEndpoint(): Promise<void> {
        await this.storage.update(this.LAST_USED_ENDPOINT, null)
    }

    public getEndpointHistory(): string[] | null {
        return this.storage.get<string[] | null>(this.CODY_ENDPOINT_HISTORY, null)
    }

    public async deleteEndpointHistory(): Promise<void> {
        await this.storage.update(this.CODY_ENDPOINT_HISTORY, null)
    }

    private async addEndpointHistory(endpoint: string): Promise<void> {
        const history = this.storage.get<string[] | null>(this.CODY_ENDPOINT_HISTORY, null)
        const historySet = new Set(history)
        historySet.delete(endpoint)
        historySet.add(endpoint)
        await this.storage.update(this.CODY_ENDPOINT_HISTORY, [...historySet])
    }

    public getChatHistory(): UserLocalHistory | null {
        const history = this.storage.get<UserLocalHistory | null>(this.KEY_LOCAL_HISTORY, null)
        return history
    }

    public async setChatHistory(history: UserLocalHistory): Promise<void> {
        try {
            await this.storage.update(this.KEY_LOCAL_HISTORY, history)
        } catch (error) {
            console.error(error)
        }
    }

    public async deleteChatHistory(chatID: string): Promise<void> {
        const userHistory = this.getChatHistory()
        if (userHistory) {
            try {
                delete userHistory.chat[chatID]
                await this.storage.update(this.KEY_LOCAL_HISTORY, { ...userHistory })
            } catch (error) {
                console.error(error)
            }
        }
    }

    public async removeChatHistory(): Promise<void> {
        try {
            await this.storage.update(this.KEY_LOCAL_HISTORY, null)
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Return the anonymous user ID stored in local storage or create one if none exists (which
     * occurs on a fresh installation).
     */
    public async anonymousUserID(): Promise<{ anonymousUserID: string; created: boolean }> {
        let id = this.storage.get<string>(this.ANONYMOUS_USER_ID_KEY)
        let created = false
        if (!id) {
            created = true
            id = uuid.v4()
            try {
                await this.storage.update(this.ANONYMOUS_USER_ID_KEY, id)
            } catch (error) {
                console.error(error)
            }
        }
        return { anonymousUserID: id, created }
    }

    public async setEnabledPlugins(plugins: string[]): Promise<void> {
        try {
            await this.storage.update(this.KEY_ENABLED_PLUGINS, plugins)
        } catch (error) {
            console.error(error)
        }
    }

    public getEnabledPlugins(): string[] | null {
        return this.storage.get<string[] | null>(this.KEY_ENABLED_PLUGINS, null)
    }

    public async setLastUsedCommands(recipes: string[]): Promise<void> {
        if (recipes.length === 0) {
            return
        }
        try {
            await this.storage.update(this.KEY_LAST_USED_RECIPES, recipes)
        } catch (error) {
            console.error(error)
        }
    }

    public getLastUsedCommands(): string[] | null {
        return this.storage.get<string[] | null>(this.KEY_LAST_USED_RECIPES, null)
    }

    public get(key: string): string | null {
        return this.storage.get(key, null)
    }

    public async set(key: string, value: string): Promise<void> {
        try {
            await this.storage.update(key, value)
        } catch (error) {
            console.error(error)
        }
    }
}

/**
 * Singleton instance of the local storage provider.
 * The underlying storage is set on extension activation via `localStorage.setStorage(context.globalState)`.
 */
export const localStorage = new LocalStorage()
