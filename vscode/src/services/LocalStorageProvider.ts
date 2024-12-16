import merge from 'lodash/merge'
import * as uuid from 'uuid'
import type { Memento } from 'vscode'

import {
    type AccountKeyedChatHistory,
    type AuthCredentials,
    type AuthStatus,
    type AuthenticatedAuthStatus,
    type ChatHistoryKey,
    type ClientState,
    type DefaultsAndUserPreferencesByEndpoint,
    type LocalStorageForModelPreferences,
    type ResolvedConfiguration,
    type UserLocalHistory,
    distinctUntilChanged,
    fromVSCodeEvent,
    startWith,
} from '@sourcegraph/cody-shared'
import { type Observable, map } from 'observable-fns'
import { isSourcegraphToken } from '../chat/protocol'
import type { GitHubDotComRepoMetaData } from '../repository/githubRepoMetadata'
import { EventEmitter } from '../testutils/mocks'
import { secretStorage } from './SecretStorageProvider'

export type ChatLocation = 'editor' | 'sidebar'

class LocalStorage implements LocalStorageForModelPreferences {
    // Bump this on storage changes so we don't handle incorrectly formatted data
    protected readonly KEY_LOCAL_HISTORY = 'cody-local-chatHistory-v2'
    protected readonly KEY_CONFIG = 'cody-config'
    protected readonly KEY_LOCAL_MINION_HISTORY = 'cody-local-minionHistory-v0'
    protected readonly CODY_ENDPOINT_HISTORY = 'SOURCEGRAPH_CODY_ENDPOINT_HISTORY'
    protected readonly CODY_ENROLLMENT_HISTORY = 'SOURCEGRAPH_CODY_ENROLLMENTS'
    protected readonly LAST_USED_CHAT_MODALITY = 'cody-last-used-chat-modality'
    protected readonly GIT_REPO_ACCESSIBILITY_KEY = 'cody-github-repo-metadata'
    public readonly ANONYMOUS_USER_ID_KEY = 'sourcegraphAnonymousUid'
    public readonly LAST_USED_ENDPOINT = 'SOURCEGRAPH_CODY_ENDPOINT'
    private readonly MODEL_PREFERENCES_KEY = 'cody-model-preferences'
    private readonly CODY_CHAT_MEMORY = 'cody-chat-memory'
    public readonly keys = {
        // LLM waitlist for the 09/12/2024 openAI o1 models
        waitlist_o1: 'CODY_WAITLIST_LLM_09122024',
        deepCodyLastUsedDate: 'DEEP_CODY_LAST_USED_DATE',
        deepCodyDailyUsageCount: 'DEEP_CODY_DAILY_CHAT_USAGE',
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

    public setStorage(storage: Memento | 'noop' | 'inMemory'): void {
        if (storage === 'inMemory') {
            this._storage = inMemoryEphemeralLocalStorage
        } else if (storage === 'noop') {
            this._storage = noopLocalStorage
        } else {
            this._storage = storage
        }
    }

    public getClientState(): ClientState {
        return {
            lastUsedEndpoint: this.getEndpoint(),
            anonymousUserID: this.anonymousUserID(),
            lastUsedChatModality: this.getLastUsedChatModality(),
            modelPreferences: this.getModelPreferences(),
            waitlist_o1: this.get(this.keys.waitlist_o1),
        }
    }

    private onChange = new EventEmitter<void>()
    public get clientStateChanges(): Observable<ClientState> {
        return fromVSCodeEvent(this.onChange.event).pipe(
            startWith(undefined),
            map(() => this.getClientState()),
            distinctUntilChanged()
        )
    }

    public async setOrDeleteWaitlistO1(value: boolean): Promise<void> {
        if (value) {
            await this.set(this.keys.waitlist_o1, value)
        } else {
            await this.delete(this.keys.waitlist_o1)
        }
    }

    public getEndpoint(): string | null {
        const endpoint = this.storage.get<string | null>(this.LAST_USED_ENDPOINT, null)
        // Clear last used endpoint if it is a Sourcegraph token
        if (endpoint && isSourcegraphToken(endpoint)) {
            this.deleteEndpoint(endpoint)
            return null
        }
        return endpoint
    }

    /**
     * Save the server endpoint to local storage *and* the access token to secret storage, but wait
     * until both are stored to emit a change even from either. This prevents the rest of the
     * application from reacting to one of the "store" events before the other is completed, which
     * would give an inconsistent view of the state.
     */
    public async saveEndpointAndToken(
        credentials: Pick<AuthCredentials, 'serverEndpoint' | 'accessToken' | 'tokenSource'>
    ): Promise<void> {
        if (!credentials.serverEndpoint) {
            return
        }
        // Do not save an access token as the last-used endpoint, to prevent user mistakes.
        if (isSourcegraphToken(credentials.serverEndpoint)) {
            return
        }

        const serverEndpoint = new URL(credentials.serverEndpoint).href

        // Pass `false` to avoid firing the change event until we've stored all of the values.
        await this.set(this.LAST_USED_ENDPOINT, serverEndpoint, false)
        await this.addEndpointHistory(serverEndpoint, false)
        if (credentials.accessToken) {
            await secretStorage.storeToken(
                serverEndpoint,
                credentials.accessToken,
                credentials.tokenSource
            )
        }
        this.onChange.fire()
    }

    public async deleteEndpoint(endpoint: string): Promise<void> {
        await this.set(endpoint, null)
        await this.deleteEndpointFromHistory(endpoint)
    }

    // Deletes and returns the endpoint history
    public async deleteEndpointHistory(): Promise<string[]> {
        const history = this.getEndpointHistory()
        await Promise.all([
            this.deleteEndpoint(this.LAST_USED_ENDPOINT),
            this.set(this.CODY_ENDPOINT_HISTORY, null),
        ])
        return history || []
    }

    // Deletes and returns the endpoint history
    public async deleteEndpointFromHistory(endpoint: string): Promise<void> {
        const history = this.getEndpointHistory()
        const historySet = new Set(history)
        historySet.delete(endpoint)
        await this.set(this.CODY_ENDPOINT_HISTORY, [...historySet])
    }

    public getEndpointHistory(): string[] | null {
        return this.get<string[] | null>(this.CODY_ENDPOINT_HISTORY)
    }

    private async addEndpointHistory(endpoint: string, fire = true): Promise<void> {
        // Do not save sourcegraph tokens as endpoint
        if (isSourcegraphToken(endpoint)) {
            return
        }

        const history = this.storage.get<string[] | null>(this.CODY_ENDPOINT_HISTORY, null)
        const historySet = new Set(history)
        historySet.delete(endpoint)
        historySet.add(endpoint)
        await this.set(this.CODY_ENDPOINT_HISTORY, [...historySet], fire)
    }

    public getChatHistory(
        authStatus: Pick<AuthenticatedAuthStatus, 'endpoint' | 'username'>
    ): UserLocalHistory {
        const history = this.storage.get<AccountKeyedChatHistory | null>(this.KEY_LOCAL_HISTORY, null)
        const accountKey = getKeyForAuthStatus(authStatus)
        return history?.[accountKey] ?? { chat: {} }
    }

    public async setChatHistory(
        authStatus: Pick<AuthenticatedAuthStatus, 'endpoint' | 'username'>,
        history: UserLocalHistory
    ): Promise<void> {
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

            await this.set(this.KEY_LOCAL_HISTORY, fullHistory)
        } catch (error) {
            console.error(error)
        }
    }

    public async importChatHistory(
        history: AccountKeyedChatHistory,
        shouldMerge: boolean
    ): Promise<void> {
        if (shouldMerge) {
            const fullHistory = this.storage.get<AccountKeyedChatHistory | null>(
                this.KEY_LOCAL_HISTORY,
                null
            )

            merge(history, fullHistory)
        }

        await this.storage.update(this.KEY_LOCAL_HISTORY, history)
    }

    public async deleteChatHistory(authStatus: AuthenticatedAuthStatus, chatID: string): Promise<void> {
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
        await this.set(this.KEY_LOCAL_MINION_HISTORY, serializedHistory)
    }

    public getMinionHistory(authStatus: AuthStatus): string | null {
        // TODO(beyang): SECURITY - use authStatus
        return this.get<string | null>(this.KEY_LOCAL_MINION_HISTORY)
    }

    public async setGitHubRepoAccessibility(data: GitHubDotComRepoMetaData[]): Promise<void> {
        await this.set(this.GIT_REPO_ACCESSIBILITY_KEY, data)
    }

    public getGitHubRepoAccessibility(): GitHubDotComRepoMetaData[] {
        const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000
        const currentTime = Date.now()

        return (this.get<GitHubDotComRepoMetaData[]>(this.GIT_REPO_ACCESSIBILITY_KEY) ?? []).filter(
            ({ timestamp }) => currentTime - timestamp <= ONE_DAY_IN_MS
        )
    }

    public async removeChatHistory(authStatus: AuthenticatedAuthStatus): Promise<void> {
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
            this.set(this.CODY_ENROLLMENT_HISTORY, history)
        }
        return hasEnrolled
    }

    /**
     * Return the anonymous user ID stored in local storage or create one if none exists (which
     * occurs on a fresh installation). Callers can check
     * {@link LocalStorage.checkIfCreatedAnonymousUserID} to see if a new anonymous ID was created.
     */
    public anonymousUserID(): string {
        let id = this.storage.get<string>(this.ANONYMOUS_USER_ID_KEY)
        if (!id) {
            this.createdAnonymousUserID = true
            id = uuid.v4()
            this.set(this.ANONYMOUS_USER_ID_KEY, id).catch(error => console.error(error))
        }
        return id
    }

    private createdAnonymousUserID = false
    public checkIfCreatedAnonymousUserID(): boolean {
        if (this.createdAnonymousUserID) {
            this.createdAnonymousUserID = false
            return true
        }
        return false
    }

    public async setConfig(config: ResolvedConfiguration): Promise<void> {
        return this.set(this.KEY_CONFIG, config)
    }

    public getConfig(): ResolvedConfiguration | null {
        return this.get(this.KEY_CONFIG)
    }

    public setLastUsedChatModality(modality: 'sidebar' | 'editor'): void {
        this.set(this.LAST_USED_CHAT_MODALITY, modality)
    }

    public getLastUsedChatModality(): 'sidebar' | 'editor' {
        return this.get(this.LAST_USED_CHAT_MODALITY) ?? 'sidebar'
    }

    public getModelPreferences(): DefaultsAndUserPreferencesByEndpoint {
        return this.get<DefaultsAndUserPreferencesByEndpoint>(this.MODEL_PREFERENCES_KEY) ?? {}
    }

    public async setModelPreferences(preferences: DefaultsAndUserPreferencesByEndpoint): Promise<void> {
        await this.set(this.MODEL_PREFERENCES_KEY, preferences)
    }

    public getChatMemory(): string[] | null {
        return this.get<string[]>(this.CODY_CHAT_MEMORY) ?? null
    }

    public async setChatMemory(memories: string[] | null): Promise<void> {
        await this.set(this.CODY_CHAT_MEMORY, memories)
    }

    public getDeepCodyUsage(): { quota: number | undefined; lastUsed: Date } {
        const quota = this.get<number>(this.keys.deepCodyDailyUsageCount) ?? undefined
        const lastUsed = new Date(
            this.get<string>(this.keys.deepCodyLastUsedDate) ?? new Date().toISOString()
        )

        return { quota, lastUsed }
    }

    public async setDeepCodyUsage(newQuota: number, lastUsed: string): Promise<void> {
        await Promise.all([
            localStorage.set(localStorage.keys.deepCodyDailyUsageCount, newQuota - 1),
            localStorage.set(localStorage.keys.deepCodyLastUsedDate, lastUsed),
        ])
    }

    public isAtDeepCodyDailyLimit(DAILY_QUOTA?: number): string | undefined {
        if (!DAILY_QUOTA) {
            return undefined
        }

        const ONE_DAY_MS = 24 * 60 * 60 * 1000

        // Get current quota and last used time, with defaults
        const currentQuota = this.get<number>(this.keys.deepCodyDailyUsageCount) ?? DAILY_QUOTA
        const lastUsedTime = new Date(
            this.get<string>(this.keys.deepCodyLastUsedDate) ?? new Date().toISOString()
        ).getTime()

        const now = new Date().getTime()
        const timeDiff = now - lastUsedTime

        // Calculate quota replenishment based on time passed
        const quotaToAdd = DAILY_QUOTA * (timeDiff / ONE_DAY_MS)
        const newQuota = Math.min(DAILY_QUOTA, currentQuota + quotaToAdd)

        // If we have at least 1 quota available
        if (newQuota >= 1) {
            // Update quota and timestamp
            Promise.all([
                this.set(this.keys.deepCodyDailyUsageCount, newQuota - 1),
                this.set(this.keys.deepCodyLastUsedDate, new Date().toISOString()),
            ])
            return undefined
        }

        // No quota available.
        // Calculate how much time after the lastUsedTime we need to wait.
        const timeToWait = ONE_DAY_MS - timeDiff
        return Math.floor(timeToWait / 1000).toString()
    }

    public get<T>(key: string): T | null {
        return this.storage.get(key, null)
    }

    public async set<T>(key: string, value: T, fire = true): Promise<void> {
        try {
            await this.storage.update(key, value)
            if (fire) {
                this.onChange.fire()
            }
        } catch (error) {
            console.error(error)
        }
    }

    public async delete(key: string): Promise<void> {
        await this.storage.update(key, undefined)
        this.onChange.fire()
    }
}

/**
 * Singleton instance of the local storage provider.
 * The underlying storage is set on extension activation via `localStorage.setStorage(context.globalState)`.
 */
export const localStorage = new LocalStorage()

function getKeyForAuthStatus(
    authStatus: Pick<AuthenticatedAuthStatus, 'endpoint' | 'username'>
): ChatHistoryKey {
    return `${authStatus.endpoint}-${authStatus.username}`
}

const noopLocalStorage = {
    get: () => null,
    update: () => Promise.resolve(undefined),
} as any as Memento

export function mockLocalStorage(storage: Memento | 'noop' | 'inMemory' = noopLocalStorage) {
    localStorage.setStorage(storage)
}

class InMemoryMemento implements Memento {
    private storage: Map<string, any> = new Map()

    get<T>(key: string, defaultValue: T): T
    get<T>(key: string): T | undefined
    get<T>(key: string, defaultValue?: T): T | undefined {
        return this.storage.has(key) ? this.storage.get(key) : defaultValue
    }

    update(key: string, value: any): Thenable<void> {
        if (value === undefined) {
            this.storage.delete(key)
        } else {
            this.storage.set(key, value)
        }
        return Promise.resolve()
    }

    keys(): readonly string[] {
        return Array.from(this.storage.keys())
    }
}

const inMemoryEphemeralLocalStorage = new InMemoryMemento()
