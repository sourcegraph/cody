import * as uuid from 'uuid'
import type { Memento } from 'vscode'

import {
    type AuthStatus,
    type ChatHistory,
    type ConfigurationWithAccessToken,
    type SerializedChatInteraction,
    type SerializedChatMessage,
    type UserLocalHistory,
    logDebug,
} from '@sourcegraph/cody-shared'

import { isSourcegraphToken } from '../chat/protocol'

type ChatHistoryKey = `${string}-${string}`
type AccountKeyedChatHistory = {
    [key: ChatHistoryKey]: PersistedUserLocalHistory
}

interface PersistedUserLocalHistory {
    chat: ChatHistory
}

/**
 * Defines the keys used to store various data in the local storage.
 *
 * NOTE: Only accessible within the LocalStorage module.
 */
const keys = {
    CHAT_HISTORY: 'cody-local-chatHistory-v2',
    CONFIG: 'cody-config',
    ANONYMOUS_USER_ID: 'sourcegraphAnonymousUid',
    LAST_USED_ENDPOINT: 'SOURCEGRAPH_CODY_ENDPOINT',
    ENDPOINT_HISTORY: 'SOURCEGRAPH_CODY_ENDPOINT_HISTORY',
    ENROLLMENT_HISTORY: 'SOURCEGRAPH_CODY_ENROLLMENTS',
    CODY_PRO_SUPPRESSION: 'extension.codyPro.suppressExpirationNotices',
    ACCESS_TOKEN_SECRET: 'cody.access-token',
}

class LocalStorage {
    // Bump this on storage changes so we don't handle incorrectly formatted data
    public readonly ANONYMOUS_USER_ID_KEY = keys.ANONYMOUS_USER_ID
    public readonly LAST_USED_ENDPOINT = keys.LAST_USED_ENDPOINT
    public readonly CODY_PRO_SUPPRESSION_KEY = keys.CODY_PRO_SUPPRESSION
    public readonly ACCESS_TOKEN_SECRET_KEY = keys.CODY_PRO_SUPPRESSION

    /**
     * Clears the local storage, excluding the anonymous user ID.
     */
    public async clear(): Promise<void> {
        for (const key of Object.values(keys)) {
            // NOTE: Keep the anonymous user ID.
            if (key !== keys.ANONYMOUS_USER_ID) {
                await this.delete(key)
            }
        }
    }

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
        const endpoint = this.storage.get<string | null>(keys.LAST_USED_ENDPOINT, null)
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
            await this.storage.update(keys.LAST_USED_ENDPOINT, uri)
            await this.addEndpointHistory(uri)
        } catch (error) {
            console.error(error)
        }
    }

    public async deleteEndpoint(): Promise<void> {
        await this.storage.update(keys.LAST_USED_ENDPOINT, null)
    }

    public getEndpointHistory(): string[] | null {
        return this.storage.get<string[] | null>(keys.ENDPOINT_HISTORY, null)
    }

    private async addEndpointHistory(endpoint: string): Promise<void> {
        // Do not save sourcegraph tokens as endpoint
        if (isSourcegraphToken(endpoint)) {
            return
        }

        const history = this.storage.get<string[] | null>(keys.ENDPOINT_HISTORY, null)
        const historySet = new Set(history)
        historySet.delete(endpoint)
        historySet.add(endpoint)
        await this.storage.update(keys.ENDPOINT_HISTORY, [...historySet])
    }

    public getChatHistory(authStatus: AuthStatus): UserLocalHistory {
        const accountKey = getKeyForAuthStatus(authStatus)
        let history = this.storage.get<AccountKeyedChatHistory>(keys.CHAT_HISTORY)

        if (history) {
            // Migrate chat history to set the `ChatMessage.model` property on each assistant message
            // instead of `chatModel` on the overall transcript. Can remove when
            // `SerializedChatTranscript.chatModel` property is removed in v1.22.
            const migratedHistory = migrateHistoryForChatModelProperty(history)
            if (history !== migratedHistory) {
                this.storage.update(keys.CHAT_HISTORY, migratedHistory).then(() => {}, console.error)
            }

            history = migratedHistory ?? history
        }

        return history?.[accountKey] ?? { chat: {} }
    }

    public async setChatHistory(authStatus: AuthStatus, history: UserLocalHistory): Promise<void> {
        try {
            const key = getKeyForAuthStatus(authStatus)
            const fullHistory = this.storage.get<{ [key: ChatHistoryKey]: UserLocalHistory }>(
                keys.CHAT_HISTORY,
                { [key]: history }
            )

            fullHistory[key] = history

            await this.storage.update(keys.CHAT_HISTORY, fullHistory)
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
        const history = this.storage.get<string[]>(keys.ENROLLMENT_HISTORY, [])
        const hasEnrolled = history.includes(featureName)
        // Log the first enrollment event
        if (!hasEnrolled) {
            history.push(featureName)
            this.storage.update(keys.ENROLLMENT_HISTORY, history)
        }
        return hasEnrolled
    }

    /**
     * Return the anonymous user ID stored in local storage or create one if none exists (which
     * occurs on a fresh installation).
     */
    public async anonymousUserID(): Promise<{ anonymousUserID: string; created: boolean }> {
        let id = this.storage.get<string>(keys.ANONYMOUS_USER_ID)
        let created = false
        if (!id) {
            created = true
            id = uuid.v4()
            try {
                await this.storage.update(keys.ANONYMOUS_USER_ID, id)
            } catch (error) {
                console.error(error)
            }
        }
        return { anonymousUserID: id, created }
    }

    public async setConfig(config: ConfigurationWithAccessToken): Promise<void> {
        return this.set(keys.CONFIG, config)
    }

    public getConfig(): ConfigurationWithAccessToken | null {
        return this.get(keys.CONFIG)
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
