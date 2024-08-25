import crypto from 'node:crypto'
import type * as vscode from 'vscode'

import { LocalStorage } from 'node-localstorage'
import * as vscode_shim from '../vscode-shim'

import path from 'node:path'
import { codyPaths } from '../codyPaths'

// NOTE: This is a simplified version of the secret storage.
// TODO: Store the secrets in system keychain or other secure storage.
export class AgentSecretStorage implements vscode.SecretStorage {
    private storage: DB
    // The key to encrypt the secret storage
    // TODO: what should be used as the default key? Should we let clients provide their own key?
    constructor(key?: string | null) {
        this.storage = key ? new LocalSecretStorageDB(key) : new InMemoryDB()
    }
    public async get(key: string): Promise<string | undefined> {
        return this.storage.get(key)
    }
    public async store(key: string, value: string): Promise<void> {
        this.storage.set(key, value)
    }
    public async delete(key: string): Promise<void> {
        this.storage.set(key, undefined)
    }
    public onDidChange: vscode.Event<vscode.SecretStorageChangeEvent> =
        new vscode_shim.EventEmitter<vscode.SecretStorageChangeEvent>().event
}

interface DB {
    get(key: string): any
    set(key: string, value: any): void
    delete(key: string): void
}

class InMemoryDB implements DB {
    private store = new Map<string, any>()
    get(key: string): any {
        return this.store.get(key)
    }
    set(key: string, value: any): void {
        this.store.set(key, value)
    }
    delete(key: string): void {
        this.store.delete(key)
    }
}

class LocalSecretStorageDB implements DB {
    private storage = new LocalStorage(path.join(codyPaths().data, '.encrypted'))
    private readonly key: Buffer
    private readonly algorithm = 'aes-256-cbc'
    constructor(encryptionKey: string) {
        this.key = crypto.scryptSync(encryptionKey, 'salt', 32)
    }
    get(key: string): string | undefined {
        const item = this.storage.getItem(key)
        return item ? this.decrypt(JSON.parse(item)) : undefined
    }
    set(key: string, value: string): void {
        if (value === undefined || value === null) {
            return
        }
        this.storage.setItem(key, JSON.stringify(this.encrypt(value)))
    }
    delete(key: string): void {
        this.storage.removeItem(key)
    }
    encrypt(value: string): string {
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv(this.algorithm, this.key, iv)
        const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
        return `${iv.toString('hex')}:${encrypted.toString('hex')}`
    }
    decrypt(encrypted: string): string {
        const [ivHex, encryptedHex] = encrypted.split(':')
        const iv = Buffer.from(ivHex, 'hex')
        const encryptedText = Buffer.from(encryptedHex, 'hex')
        const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv)
        return Buffer.concat([decipher.update(encryptedText), decipher.final()]).toString('utf8')
    }
}
