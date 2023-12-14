import * as uuid from 'uuid'
import { Memento } from 'vscode'

import { UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { AuthStatus } from '../chat/protocol'

export class LocalStorage {
    // Bump this on storage changes so we don't handle incorrectly formatted data
    protected readonly KEY_LOCAL_HISTORY = 'cody-local-chatHistory-v2'
    protected readonly ANONYMOUS_USER_ID_KEY = 'sourcegraphAnonymousUid'
    protected readonly LAST_USED_ENDPOINT = 'SOURCEGRAPH_CODY_ENDPOINT'
    protected readonly CODY_ENDPOINT_HISTORY = 'SOURCEGRAPH_CODY_ENDPOINT_HISTORY'
    protected readonly KEY_LAST_USED_RECIPES = 'SOURCEGRAPH_CODY_LAST_USED_RECIPE_NAMES'

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

    private dbg(action: string): void {
        console.log('########## ' + action + ' ##########')
        console.log(this.storage.get<any>(this.KEY_LOCAL_HISTORY, null))
        console.log('##############################')
    }

    public getChatHistory(authStatus: AuthStatus): UserLocalHistory {
        this.dbg('getChatHistory')
        let history = this.storage.get<{ [key: `${string}-${string}`]: UserLocalHistory } | UserLocalHistory | null>(
            this.KEY_LOCAL_HISTORY,
            null
        )
        if (!history) {
            return { chat: {}, input: [] }
        }

        const key = getKeyForAuthStatus(authStatus)

        // For backwards compatibility, we upgrade the local storage key from the old layout that is
        // not scoped to individual user accounts to be scoped instead.
        if (history && !isChatHistoryV2(history)) {
            console.log('ATTEMPTING UPGRADE PROCEDURE')
            history = {
                [key]: history,
            }

            // We use a raw write here to ensure we do not _append_ a key but actually replace
            // existing `chat` and `input` keys.
            void this.storage.update(this.KEY_LOCAL_HISTORY, history)
        }

        if (!history[key]) {
            return { chat: {}, input: [] }
        }
        return history[key]
    }

    public async setChatHistory(authStatus: AuthStatus, history: UserLocalHistory): Promise<void> {
        this.dbg('setChatHistory')
        try {
            const key = getKeyForAuthStatus(authStatus)
            let fullHistory = this.storage.get<{ [key: string]: UserLocalHistory } | null>(this.KEY_LOCAL_HISTORY, null)

            if (fullHistory) {
                fullHistory[key] = history
            } else {
                fullHistory = {
                    [key]: history,
                }
            }

            await this.storage.update(this.KEY_LOCAL_HISTORY, fullHistory)
        } catch (error) {
            console.error(error)
        }
    }

    public async deleteChatHistory(authStatus: AuthStatus, chatID: string): Promise<void> {
        const userHistory = this.getChatHistory(authStatus)
        if (userHistory) {
            try {
                delete userHistory.chat[chatID]
                await this.setChatHistory(authStatus, userHistory)
            } catch (error) {
                console.error(error)
            }
        }
    }

    // TODO
    public async removeChatHistory(authStatus: AuthStatus): Promise<void> {
        try {
            await this.setChatHistory(authStatus, { chat: {}, input: [] })
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

    public async delete(key: string): Promise<void> {
        await this.storage.update(key, undefined)
    }
}

/**
 * Singleton instance of the local storage provider.
 * The underlying storage is set on extension activation via `localStorage.setStorage(context.globalState)`.
 */
export const localStorage = new LocalStorage()

function getKeyForAuthStatus(authStatus: AuthStatus): `${string}-${string}` {
    return `${authStatus.endpoint}-${authStatus.primaryEmail}`
}

function isChatHistoryV2(history: { [key: `${string}-${string}`]: UserLocalHistory } | UserLocalHistory): boolean {
    return !!Object.keys(history).find(k => k.includes('-'))
}
