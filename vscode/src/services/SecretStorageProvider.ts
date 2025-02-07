import * as vscode from 'vscode'

import type { ClientSecrets, TokenSource } from '@sourcegraph/cody-shared'
import { logDebug, logError } from '../output-channel-logger'
const CODY_ACCESS_TOKEN_SOURCE = 'cody.access-token.source'
const CODY_ACCESS_TOKEN_SECRET = 'cody.access-token'

interface SecretStorage extends vscode.SecretStorage, ClientSecrets {
    get(key: string): Promise<string | undefined>
    store(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
    onDidChange(callback: (event: { key: string }) => Promise<void>): vscode.Disposable

    // Shorthand for persisting the user's Cody Access token based on
    // the Sourcegraph instance endpoint it is associated with.
    storeToken(
        endpoint: string,
        accessToken: string,
        tokenSource: TokenSource | undefined
    ): Promise<void>
    getToken(endpoint: string): Promise<string | undefined>
    deleteToken(endpoint: string): Promise<void>
    getTokenSource(endpoint: string): Promise<TokenSource | undefined>
}

export class VSCodeSecretStorage implements SecretStorage {
    private fsPath: string | null = null

    /**
     * Should be set on extension activation via `secretStorage.setStorage(context.secrets)`
     * Done to avoid passing the secret storage around as a parameter and instead
     * access it as a singleton via the module import.
     */
    private _secretStorage: vscode.SecretStorage | null = null

    private get secretStorage(): vscode.SecretStorage {
        if (!this._secretStorage) {
            throw new Error('SecretStorage not initialized')
        }

        return this._secretStorage
    }

    public setStorage(secretStorage: vscode.SecretStorage): void {
        this._secretStorage = secretStorage
    }

    constructor() {
        const config = vscode.workspace.getConfiguration('cody')
        // For user that does not have secret storage implemented in their server
        this.fsPath = config.get('experimental.localTokenPath') || null
        if (this.fsPath) {
            logDebug('VSCodeSecretStorage:experimental.localTokenPath', 'enabled', {
                verbose: this.fsPath,
            })
        }
    }

    // Catch corrupted token in secret storage
    public async get(key: string): Promise<string | undefined> {
        // If fsPath is provided, get token from fsPath instead of secret storage
        if (this.fsPath && this.fsPath?.length > 0) {
            return this.getFromFsPath(this.fsPath)
        }
        try {
            if (key) {
                return await this.secretStorage.get(key)
            }
        } catch (error) {
            console.error('Failed to get token from Secret Storage', error)
        }
        return undefined
    }

    private async getFromFsPath(fsPath: string): Promise<string | undefined> {
        return (await getAccessTokenFromFsPath(fsPath)) || undefined
    }

    public async store(key: string, value: string): Promise<void> {
        try {
            if (value?.length > 0) {
                await this.secretStorage.store(key, value)
            }
        } catch (error) {
            logError('VSCodeSecretStorage:store:failed', key, { verbose: error })
        }
    }

    public async getToken(endpoint: string): Promise<string | undefined> {
        return this.get(endpoint)
    }
    public async getTokenSource(endpoint: string): Promise<TokenSource | undefined> {
        const tokenSource = await this.get(endpoint + CODY_ACCESS_TOKEN_SOURCE)
        return tokenSource as TokenSource | undefined
    }

    public async storeToken(
        endpoint: string,
        accessToken: string,
        tokenSource: TokenSource | undefined
    ): Promise<void> {
        if (!accessToken || !endpoint) {
            return
        }
        await this.store(endpoint, accessToken)
        await this.store(CODY_ACCESS_TOKEN_SECRET, accessToken)

        if (!tokenSource) {
            return
        }
        await this.store(endpoint + CODY_ACCESS_TOKEN_SOURCE, tokenSource)
    }

    public async deleteToken(endpoint: string): Promise<void> {
        await this.secretStorage.delete(endpoint)
        await this.secretStorage.delete(CODY_ACCESS_TOKEN_SECRET)
        await this.secretStorage.delete(endpoint + CODY_ACCESS_TOKEN_SOURCE)
    }

    public async delete(key: string): Promise<void> {
        await this.secretStorage.delete(key)
    }

    public onDidChange(callback: ({ key }: { key: string }) => Promise<void>): vscode.Disposable {
        return this.secretStorage.onDidChange(event => {
            // Run callback on token changes for current endpoint only
            if (event.key === CODY_ACCESS_TOKEN_SECRET) {
                return callback({ key: event.key })
            }
            return
        })
    }
}

class InMemorySecretStorage implements SecretStorage {
    private storage: Map<string, string> = new Map<string, string>()
    private callbacks: ((event: { key: string }) => Promise<void>)[] = []

    constructor(initialState?: string | undefined, initialToken?: string | undefined) {
        if (initialState) {
            const parsedState = JSON.parse(initialState)
            if (Array.isArray(parsedState)) {
                for (const [key, value] of parsedState) {
                    this.storage.set(key, value)
                }
            } else {
                throw new Error('Initial secret storage state must be an array of (key, value) entries')
            }
        }
        if (initialToken) {
            const parsedToken = JSON.parse(initialToken)
            if (Array.isArray(parsedToken) && parsedToken.length === 2) {
                // The default types of tokensource is undefined(This is to make sure that older tokens from before are not deleted because we don't know their tokenSource)
                const tokenSource = undefined
                this.storeToken(parsedToken[0], parsedToken[1], tokenSource)
            } else {
                throw new Error('Initial token must be an array with [endpoint, value]')
            }
        }
    }

    public async get(key: string): Promise<string | undefined> {
        return Promise.resolve(this.storage.get(key))
    }

    public async store(key: string, value: string): Promise<void> {
        if (!value) {
            return
        }

        this.storage.set(key, value)

        for (const cb of this.callbacks) {
            void cb({ key })
        }

        return Promise.resolve()
    }

    public async getToken(endpoint: string): Promise<string | undefined> {
        return this.get(endpoint)
    }
    public async getTokenSource(endpoint: string): Promise<TokenSource | undefined> {
        const tokenSource = await this.get(endpoint + CODY_ACCESS_TOKEN_SOURCE)
        return tokenSource as TokenSource | undefined
    }

    public async storeToken(
        endpoint: string,
        accessToken: string,
        tokenSource: TokenSource | undefined
    ): Promise<void> {
        await this.store(endpoint, accessToken)
        await this.store(CODY_ACCESS_TOKEN_SECRET, accessToken)
        if (tokenSource) {
            await this.store(endpoint + CODY_ACCESS_TOKEN_SOURCE, tokenSource)
        }
    }

    public async deleteToken(endpoint: string): Promise<void> {
        await this.delete(endpoint)
        await this.delete(CODY_ACCESS_TOKEN_SECRET)
    }

    public async delete(key: string): Promise<void> {
        this.storage.delete(key)

        for (const cb of this.callbacks) {
            void cb({ key })
        }

        return Promise.resolve()
    }

    public onDidChange(callback: ({ key }: { key: string }) => Promise<void>): vscode.Disposable {
        this.callbacks.push(callback)

        return new vscode.Disposable(() => {
            const callbackIndex = this.callbacks.indexOf(callback)
            this.callbacks.splice(callbackIndex, 1)
        })
    }
}

async function getAccessTokenFromFsPath(fsPath: string): Promise<string | null> {
    try {
        const fsPathUri = vscode.Uri.file(fsPath)
        const fileContent = await vscode.workspace.fs.readFile(fsPathUri)
        const decoded = new TextDecoder('utf-8').decode(fileContent)
        const json = JSON.parse(decoded) as ConfigJson
        if (!json.token) {
            throw new Error(`Failed to retrieve token from: ${fsPath}`)
        }
        logDebug('VSCodeSecretStorage:getAccessTokenFromFsPath', 'retrieved')
        return json.token
    } catch (error) {
        logError('VSCodeSecretStorage:getAccessTokenFromFsPath', 'failed', { verbose: error })
        return null
    }
}
interface ConfigJson {
    token: string
}

/**
 * Singleton instance of the secret storage provider.
 * The underlying storage is set on extension activation via `secretStorage.setStorage(context.secrets)`.
 */
export const secretStorage =
    process.env.CODY_TESTING === 'true' || process.env.CODY_PROFILE_TEMP === 'true'
        ? new InMemorySecretStorage(
              process.env.CODY_TESTING === 'true' ? process.env.TESTING_SECRET_STORAGE_STATE : undefined,
              process.env.CODY_TESTING === 'true' ? process.env.TESTING_SECRET_STORAGE_TOKEN : undefined
          )
        : new VSCodeSecretStorage()
