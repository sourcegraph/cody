import * as vscode from 'vscode'

import { isLocalApp } from '../chat/protocol'
import { debug } from '../log'

export const CODY_ACCESS_TOKEN_SECRET = 'cody.access-token'

export async function getAccessToken(secretStorage: SecretStorage): Promise<string | null> {
    try {
        return (await secretStorage.get(CODY_ACCESS_TOKEN_SECRET)) || null
    } catch (error) {
        // Remove corrupted token from secret storage
        await secretStorage.delete(CODY_ACCESS_TOKEN_SECRET)
        // Display system notification because the error was caused by system storage
        void vscode.window.showErrorMessage(`Failed to retrieve access token for Cody from secret storage: ${error}`)
        return null
    }
}

export interface SecretStorage {
    get(key: string): Promise<string | undefined>
    store(key: string, value: string): Promise<void>
    storeToken(endpoint: string, value: string): Promise<void>
    deleteToken(endpoint: string): Promise<void>
    delete(key: string): Promise<void>
    onDidChange(callback: (key: string) => Promise<void>): vscode.Disposable
}

export class VSCodeSecretStorage implements SecretStorage {
    private fsPath: string | null = null
    constructor(private secretStorage: vscode.SecretStorage) {
        const config = vscode.workspace.getConfiguration('cody')
        // For user that does not have secret storage implemented in their sever
        this.fsPath = config.get('experimental.localTokenPath') || null
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
        debug('VSCodeSecretStorage:getAccessTokenFromFsPath', fsPath)
        return (await getAccessTokenFromFsPath(fsPath)) || undefined
    }

    public async store(key: string, value: string): Promise<void> {
        if (value && value.length > 8) {
            await this.secretStorage.store(key, value)
        }
    }

    public async storeToken(endpoint: string, value: string): Promise<void> {
        if (!value || !endpoint) {
            return
        }
        if (isLocalApp(endpoint)) {
            await this.store('SOURCEGRAPH_CODY_APP', value)
        }
        await this.store(endpoint, value)
        await this.store(CODY_ACCESS_TOKEN_SECRET, value)
    }

    public async deleteToken(endpoint: string): Promise<void> {
        await this.secretStorage.delete(endpoint)
        await this.secretStorage.delete(CODY_ACCESS_TOKEN_SECRET)
    }

    public async delete(key: string): Promise<void> {
        await this.secretStorage.delete(key)
    }

    public onDidChange(callback: (key: string) => Promise<void>): vscode.Disposable {
        return this.secretStorage.onDidChange(event => {
            // Run callback on token changes for current endpoint only
            if (event.key === CODY_ACCESS_TOKEN_SECRET) {
                return callback(event.key)
            }
            return
        })
    }
}

export class InMemorySecretStorage implements SecretStorage {
    private storage: Map<string, string>
    private callbacks: ((key: string) => Promise<void>)[]

    constructor() {
        this.storage = new Map<string, string>()
        this.callbacks = []
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
            // eslint-disable-next-line callback-return
            void cb(key)
        }

        return Promise.resolve()
    }

    public async storeToken(endpoint: string, value: string): Promise<void> {
        await this.store(endpoint, value)
        await this.store(CODY_ACCESS_TOKEN_SECRET, value)
    }

    public async deleteToken(endpoint: string): Promise<void> {
        await this.delete(endpoint)
        await this.delete(CODY_ACCESS_TOKEN_SECRET)
    }

    public async delete(key: string): Promise<void> {
        this.storage.delete(key)

        for (const cb of this.callbacks) {
            // eslint-disable-next-line callback-return
            void cb(key)
        }

        return Promise.resolve()
    }

    public onDidChange(callback: (key: string) => Promise<void>): vscode.Disposable {
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
        const data = await vscode.workspace.fs.readFile(fsPathUri)
        const json = JSON.parse(data.toString()) as ConfigJson
        return json.token
    } catch {
        debug('VSCodeSecretStorage:getAccessTokenFromFsPath', 'failed to get token from fsPath')
        return null
    }
}
interface ConfigJson {
    token: string
}
