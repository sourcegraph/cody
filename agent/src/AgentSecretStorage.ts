import type * as vscode from 'vscode'
import { emptyEvent } from '../../vscode/src/testutils/emptyEvent'
import type { MessageHandler } from './jsonrpc-alias'

export class AgentStatelessSecretStorage implements vscode.SecretStorage {
    private readonly inMemorySecretStorageMap = new Map<string, string>()
    public get(key: string): Thenable<string | undefined> {
        return Promise.resolve(this.inMemorySecretStorageMap.get(key))
    }
    public store(key: string, value: string): Thenable<void> {
        this.inMemorySecretStorageMap.set(key, value)
        return Promise.resolve()
    }
    public delete(key: string): Thenable<void> {
        this.inMemorySecretStorageMap.delete(key)
        return Promise.resolve()
    }
    onDidChange: vscode.Event<vscode.SecretStorageChangeEvent> = emptyEvent()
}

export class AgentClientManagedSecretStorage implements vscode.SecretStorage {
    constructor(
        private readonly agent: MessageHandler,
        public readonly onDidChange: vscode.Event<vscode.SecretStorageChangeEvent>
    ) {}
    public async get(key: string): Promise<string | undefined> {
        const result = await this.agent.request('secrets/get', { key })
        return result ?? undefined
    }
    public async store(key: string, value: string): Promise<void> {
        await this.agent.request('secrets/store', { key, value })
    }
    public async delete(key: string): Promise<void> {
        await this.agent.request('secrets/delete', { key })
    }
}
