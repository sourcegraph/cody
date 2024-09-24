import type * as vscode from 'vscode'
import type { MessageHandler } from './jsonrpc-alias'
import { EventEmitter } from './vscode-shim'

export class AgentStatelessSecretStorage implements vscode.SecretStorage {
    private readonly inMemorySecretStorageMap = new Map<string, string>()

    constructor(seedRecords?: Record<string, string | undefined>) {
        if (seedRecords) {
            for (const key in seedRecords) {
                if (seedRecords[key]) {
                    this.inMemorySecretStorageMap.set(key, seedRecords[key])
                }
            }
        }
    }

    public get(key: string): Thenable<string | undefined> {
        return Promise.resolve(this.inMemorySecretStorageMap.get(key))
    }
    public store(key: string, value: string): Thenable<void> {
        this.inMemorySecretStorageMap.set(key, value)
        this.onDidChangeEvent.fire({ key })
        return Promise.resolve()
    }
    public delete(key: string): Thenable<void> {
        this.inMemorySecretStorageMap.delete(key)
        this.onDidChangeEvent.fire({ key })
        return Promise.resolve()
    }
    private onDidChangeEvent = new EventEmitter<vscode.SecretStorageChangeEvent>()
    onDidChange: vscode.Event<vscode.SecretStorageChangeEvent> = this.onDidChangeEvent.event
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
