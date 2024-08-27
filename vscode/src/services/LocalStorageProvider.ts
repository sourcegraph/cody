import _ from 'lodash'
import * as uuid from 'uuid'
import type { Memento } from 'vscode'

import type {
    AccountKeyedChatHistory,
    AuthStatus,
    ChatHistoryKey,
    ClientConfigurationWithAccessToken,
    UserLocalHistory,
} from '@sourcegraph/cody-shared'

import { isSourcegraphToken } from '../chat/protocol'

export type ChatLocation = 'editor' | 'sidebar'

class LocalStorage {
    // Bump this on storage changes so we don't handle incorrectly formatted data
    protected readonly KEY_LOCAL_HISTORY = 'cody-local-chatHistory-v2'
    protected readonly KEY_CONFIG = 'cody-config'
    protected readonly KEY_LOCAL_MINION_HISTORY = 'cody-local-minionHistory-v0'
    public readonly ANONYMOUS_USER_ID_KEY = 'sourcegraphAnonymousUid'
    public readonly LAST_USED_ENDPOINT = 'SOURCEGRAPH_CODY_ENDPOINT'
    public readonly LAST_USED_USERNAME = 'SOURCEGRAPH_CODY_USERNAME'
    protected readonly CODY_ENDPOINT_HISTORY = 'SOURCEGRAPH_CODY_ENDPOINT_HISTORY'
    protected readonly CODY_ENROLLMENT_HISTORY = 'SOURCEGRAPH_CODY_ENROLLMENTS'
    protected readonly LAST_USED_CHAT_MODALITY = 'cody-last-used-chat-modality'

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
        const endpoint = this.storage.get<string | null>(this.LAST_USED_ENDPOINT, null)
        // Clear last used endpoint if it is a Sourcegraph token
        if (endpoint && isSourcegraphToken(endpoint)) {
            this.deleteEndpoint()
            return null
        }
        return endpoint
    }

    public async saveEndpoint(endpoint: string): Promise<void> {
        if (!endpoint) {
            return
        }
        try {
            // Do not save sourcegraph tokens as the last used endpoint
            if (isSourcegraphToken(endpoint)) {
                return
            }

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

    private async addEndpointHistory(endpoint: string): Promise<void> {
        // Do not save sourcegraph tokens as endpoint
        if (isSourcegraphToken(endpoint)) {
            return
        }

        const history = this.storage.get<string[] | null>(this.CODY_ENDPOINT_HISTORY, null)
        const historySet = new Set(history)
        historySet.delete(endpoint)
        historySet.add(endpoint)
        await this.storage.update(this.CODY_ENDPOINT_HISTORY, [...historySet])
    }

    public getLastStoredUser(): { endpoint: string; username: string } | null {
        const username = this.storage.get<string | null>(this.LAST_USED_USERNAME, null)
        const endpoint = this.getEndpoint()
        return username && endpoint ? { endpoint, username } : null
    }

    public getChatHistory(authStatus: AuthStatus): UserLocalHistory {
        const history = this.storage.get<AccountKeyedChatHistory | null>(this.KEY_LOCAL_HISTORY, null)
        const accountKey = getKeyForAuthStatus(authStatus)
        return history?.[accountKey] ?? { chat: {} }
    }

    public async setChatHistory(authStatus: AuthStatus, history: UserLocalHistory): Promise<void> {
        try {
            const key = getKeyForAuthStatus(authStatus)
            let fullHistory = this.storage.get<AccountKeyedChatHistory | null>(
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

            // Store the current username as the last used username
            if (authStatus.username) {
                this.storage.update(this.LAST_USED_USERNAME, authStatus.username)
            }
        } catch (error) {
            console.error(error)
        }
    }

    public async importChatHistory(history: AccountKeyedChatHistory, merge: boolean): Promise<void> {
        if (merge) {
            const fullHistory = this.storage.get<AccountKeyedChatHistory | null>(
                this.KEY_LOCAL_HISTORY,
                null
            )

            _.merge(history, fullHistory)
        }

        await this.storage.update(this.KEY_LOCAL_HISTORY, history)
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

    public async setMinionHistory(authStatus: AuthStatus, serializedHistory: string): Promise<void> {
        // TODO(beyang): SECURITY - use authStatus
        await this.storage.update(this.KEY_LOCAL_MINION_HISTORY, serializedHistory)
    }

    public getMinionHistory(authStatus: AuthStatus): string | null {
        // TODO(beyang): SECURITY - use authStatus
        return this.storage.get<string | null>(this.KEY_LOCAL_MINION_HISTORY, null)
    }

    public async removeChatHistory(authStatus: AuthStatus): Promise<void> {
        try {
            await this.setChatHistory(authStatus, { chat: {} })
        } catch (error) {
            console.error(error)
        }
    }

    /**
     * Gets the enrollment history for a feature from the storage.
     *
     * Checks if the given feature name exists in the stored enrollment
     * history array.
     *
     * If not, add the feature to the memory, but return false after adding the feature
     * so that the caller can log the first enrollment event.
     */
    public getEnrollmentHistory(featureName: string): boolean {
        const history = this.storage.get<string[]>(this.CODY_ENROLLMENT_HISTORY, [])
        const hasEnrolled = history.includes(featureName)
        // Log the first enrollment event
        if (!hasEnrolled) {
            history.push(featureName)
            this.storage.update(this.CODY_ENROLLMENT_HISTORY, history)
        }
        return hasEnrolled
    }

    /**
     * Return the anonymous user ID stored in local storage or create one if none exists (which
     * occurs on a fresh installation).
     */
    public anonymousUserID(): { anonymousUserID: string; created: boolean } {
        let id = this.storage.get<string>(this.ANONYMOUS_USER_ID_KEY)
        let created = false
        if (!id) {
            created = true
            id = uuid.v4()
            Promise.resolve(this.storage.update(this.ANONYMOUS_USER_ID_KEY, id).then(undefined)).catch(
                error => console.error(error)
            )
        }
        return { anonymousUserID: id, created }
    }

    public async setConfig(config: ClientConfigurationWithAccessToken): Promise<void> {
        return this.set(this.KEY_CONFIG, config)
    }

    public getConfig(): ClientConfigurationWithAccessToken | null {
        return this.get(this.KEY_CONFIG)
    }

    public setLastUsedChatModality(modality: 'sidebar' | 'editor'): void {
        this.set(this.LAST_USED_CHAT_MODALITY, modality)
    }

    public getLastUsedChatModality(): 'sidebar' | 'editor' {
        return this.storage?.get(this.LAST_USED_CHAT_MODALITY) ?? 'sidebar'
    }

    public get<T>(key: string): T | null {
        return this.storage.get(key, null)
    }

    public async set<T>(key: string, value: T): Promise<void> {
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

function getKeyForAuthStatus(authStatus: AuthStatus): ChatHistoryKey {
    return `${authStatus.endpoint}-${authStatus.username}`
}
