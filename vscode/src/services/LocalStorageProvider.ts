import * as uuid from 'uuid'
import { type Memento } from 'vscode'

import { type ChatHistory, type UserLocalHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { type AuthStatus } from '../chat/protocol'

type ChatHistoryKey = `${string}-${string}`
type AccountKeyedChatHistory = {
    [key: ChatHistoryKey]: UserLocalHistory
} & {
    // For backward compatibility, we do not want to delete the `chat` and `input` keys.
    // As otherwise, downgrading to a prior version would completely block the startup
    // as the client would throw.
    //
    // TODO: This can be removed in a future version
    chat: ChatHistory
    input: []
}

class LocalStorage {
    // Bump this on storage changes so we don't handle incorrectly formatted data
    protected readonly KEY_LOCAL_HISTORY = 'cody-local-chatHistory-v2'
    public readonly ANONYMOUS_USER_ID_KEY = 'sourcegraphAnonymousUid'
    public readonly LAST_USED_ENDPOINT = 'SOURCEGRAPH_CODY_ENDPOINT'
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

    public getChatHistory(authStatus: AuthStatus): UserLocalHistory {
        let history = this.storage.get<AccountKeyedChatHistory | UserLocalHistory | null>(this.KEY_LOCAL_HISTORY, null)
        if (!history) {
            return { chat: {}, input: [] }
        }

        const key = getKeyForAuthStatus(authStatus)

        // For backwards compatibility, we upgrade the local storage key from the old layout that is
        // not scoped to individual user accounts to be scoped instead.
        if (history && !isMigratedChatHistory2261(history)) {
            // HACK: We spread both parts here as TS would otherwise have issues validating the type
            //       of AccountKeyedChatHistory. This is only three fields though.
            history = {
                ...{ [key]: history },
                ...{
                    chat: {},
                    input: [],
                },
            } satisfies AccountKeyedChatHistory
            // We use a raw write here to ensure we do not _append_ a key but actually replace
            // existing `chat` and `input` keys.
            // The result is not awaited to avoid changing this API to be async.
            this.storage.update(this.KEY_LOCAL_HISTORY, history).then(() => {}, console.error)
        }

        if (!Object.hasOwn(history, key)) {
            return { chat: {}, input: [] }
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        return (history as any)[key]
    }

    public async setChatHistory(authStatus: AuthStatus, history: UserLocalHistory): Promise<void> {
        try {
            const key = getKeyForAuthStatus(authStatus)
            let fullHistory = this.storage.get<{ [key: ChatHistoryKey]: UserLocalHistory } | null>(
                this.KEY_LOCAL_HISTORY,
                null
            )

            if (fullHistory) {
                fullHistory[key] = history
            } else {
                fullHistory = {
                    [key]: history,
                }
            }

            await this.storage.update(this.KEY_LOCAL_HISTORY, fullHistory)

            // MIGRATION: Delete old/orphaned storage data from a previous migration.
            this.migrateChatHistory2665(fullHistory as AccountKeyedChatHistory)
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

    /**
     * In https://github.com/sourcegraph/cody/pull/2665 we migrated the chat history key to use the
     * user's username instead of their email address. This means that the storage would retain the chat
     * history under the old key indefinitely. Large storage data slows down extension host activation
     * and each `Memento#update` call, so we don't want it to linger.
     */
    private migrateChatHistory2665(history: AccountKeyedChatHistory): void {
        const needsMigration = Object.keys(history).some(key => key.includes('@'))
        if (needsMigration) {
            const cleanedHistory = Object.fromEntries(Object.entries(history).filter(([key]) => !key.includes('@')))
            this.storage.update(this.KEY_LOCAL_HISTORY, cleanedHistory).then(() => {}, console.error)
        }
    }
}

/**
 * Singleton instance of the local storage provider.
 * The underlying storage is set on extension activation via `localStorage.setStorage(context.globalState)`.
 */
export const localStorage = new LocalStorage()

function getKeyForAuthStatus(authStatus: AuthStatus): ChatHistoryKey {
    return `${authStatus.endpoint}-${authStatus.username}`
}

/**
 * As part of #2261, we migrated the storage format of the chat history to be keyed by the current
 * user account. This checks if the new format is used by checking if any key contains a hyphen (the
 * separator between endpoint and email in the new format).
 */
function isMigratedChatHistory2261(
    history: AccountKeyedChatHistory | UserLocalHistory
): history is AccountKeyedChatHistory {
    return !!Object.keys(history).find(k => k.includes('-'))
}
