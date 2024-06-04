import * as uuid from 'uuid'
import type { Memento } from 'vscode'

import {
    type AuthStatus,
    type ChatHistory,
    type ConfigurationWithAccessToken,
    type MemoryStorage,
    type SerializedChatInteraction,
    type SerializedChatMessage,
    type UserLocalHistory,
    logDebug,
} from '@sourcegraph/cody-shared'

import { isSourcegraphToken } from '../chat/protocol'

type AuthStatusKey = `${string}-${string}`

type AccountKeyedChatHistory = {
    [key: AuthStatusKey]: PersistedUserLocalHistory
}

interface PersistedUserLocalHistory {
    chat: ChatHistory
}

type AccountKeyedChatMemory = {
    [key: AuthStatusKey]: MemoryStorage | null
}

class LocalStorage {
    // Bump this on storage changes so we don't handle incorrectly formatted data
    protected readonly KEY_LOCAL_HISTORY = 'cody-local-chatHistory-v2'
    protected readonly KEY_CONFIG = 'cody-config'
    protected readonly KEY_LOCAL_MINION_HISTORY = 'cody-local-minionHistory-v0'
    protected readonly KEY_LOCAL_MEMORY = 'cody-local-memory-v1'
    public readonly ANONYMOUS_USER_ID_KEY = 'sourcegraphAnonymousUid'
    public readonly LAST_USED_ENDPOINT = 'SOURCEGRAPH_CODY_ENDPOINT'
    protected readonly CODY_ENDPOINT_HISTORY = 'SOURCEGRAPH_CODY_ENDPOINT_HISTORY'
    protected readonly CODY_ENROLLMENT_HISTORY = 'SOURCEGRAPH_CODY_ENROLLMENTS'

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

    public getChatHistory(authStatus: AuthStatus): UserLocalHistory {
        const history = this.storage.get<AccountKeyedChatHistory | null>(this.KEY_LOCAL_HISTORY, null)
        const accountKey = getKeyForAuthStatus(authStatus)

        // Migrate chat history to set the `ChatMessage.model` property on each assistant message
        // instead of `chatModel` on the overall transcript. Can remove when
        // `SerializedChatTranscript.chatModel` property is removed in v1.22.
        const migratedHistory = migrateHistoryForChatModelProperty(history)
        if (history !== migratedHistory) {
            this.storage.update(this.KEY_LOCAL_HISTORY, migratedHistory).then(() => {}, console.error)
        }

        return migratedHistory?.[accountKey] ?? { chat: {} }
    }

    public async setChatHistory(authStatus: AuthStatus, history: UserLocalHistory): Promise<void> {
        try {
            const key = getKeyForAuthStatus(authStatus)
            let fullHistory = this.storage.get<{ [key: AuthStatusKey]: UserLocalHistory } | null>(
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

    public getChatMemory(authStatus: AuthStatus): MemoryStorage | null {
        const history = this.storage.get<AccountKeyedChatMemory | null>(this.KEY_LOCAL_MEMORY, null)
        const accountKey = getKeyForAuthStatus(authStatus)

        return history?.[accountKey] ?? null
    }

    public async setChatMemory(authStatus: AuthStatus, memory: MemoryStorage | null): Promise<void> {
        try {
            const authStatusKey = getKeyForAuthStatus(authStatus)
            let authStatusMemoryMap = this.storage.get<AccountKeyedChatMemory | null>(
                this.KEY_LOCAL_HISTORY,
                null
            )

            if (authStatusMemoryMap) {
                authStatusMemoryMap[authStatusKey] = memory
            } else {
                authStatusMemoryMap = {
                    [authStatusKey]: memory,
                }
            }

            await this.storage.update(this.KEY_LOCAL_MEMORY, authStatusMemoryMap)
        } catch (error) {
            console.error(error)
        }
    }

    public async clearChatMemory(authStatus: AuthStatus): Promise<void> {
        try {
            await this.setChatMemory(authStatus, null)
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

    public async setConfig(config: ConfigurationWithAccessToken): Promise<void> {
        return this.set(this.KEY_CONFIG, config)
    }

    public getConfig(): ConfigurationWithAccessToken | null {
        return this.get(this.KEY_CONFIG)
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

function getKeyForAuthStatus(authStatus: AuthStatus): AuthStatusKey {
    return `${authStatus.endpoint}-${authStatus.username}`
}

/**
 * Migrate chat history to set the {@link ChatMessage.model} property on each assistant message
 * instead of {@link SerializedChatTranscript.chatModel} on the overall transcript. Can remove when
 * {@link SerializedChatTranscript.chatModel} property is removed in v1.22.
 */
function migrateHistoryForChatModelProperty(
    history: AccountKeyedChatHistory | null
): AccountKeyedChatHistory | null {
    if (!history) {
        return null
    }

    let neededMigration = 0
    function migrateAssistantMessage(
        assistantMessage: SerializedChatMessage,
        model: string | undefined
    ): SerializedChatMessage {
        if (assistantMessage.model) {
            return assistantMessage
        }
        neededMigration++
        return {
            ...assistantMessage,
            model: model ?? 'unknown',
        }
    }

    const migratedHistory = Object.fromEntries(
        Object.entries(history).map(([accountKey, userLocalHistory]) => [
            accountKey,
            {
                chat: userLocalHistory.chat
                    ? Object.fromEntries(
                          Object.entries(userLocalHistory.chat).map(([id, transcript]) => [
                              id,
                              transcript
                                  ? {
                                        ...transcript,
                                        interactions: transcript.interactions.map(
                                            interaction =>
                                                ({
                                                    ...interaction,
                                                    assistantMessage: interaction.assistantMessage
                                                        ? migrateAssistantMessage(
                                                              interaction.assistantMessage,
                                                              transcript.chatModel
                                                          )
                                                        : null,
                                                }) satisfies SerializedChatInteraction
                                        ),
                                    }
                                  : transcript,
                          ])
                      )
                    : {},
            },
        ])
    )
    if (neededMigration) {
        logDebug('migrateHistoryForChatModelProperty', `${neededMigration} chat messages migrated`)
        return migratedHistory
    }
    return history
}
