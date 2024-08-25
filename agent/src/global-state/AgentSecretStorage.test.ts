import { beforeEach, describe, expect, it } from 'vitest'
import { AgentSecretStorage } from './AgentSecretStorage'

describe('AgentSecretStorage', () => {
    let secretStorage: AgentSecretStorage

    beforeEach(() => {
        secretStorage = new AgentSecretStorage()
    })

    it('should store and retrieve secrets', async () => {
        await secretStorage.store('testKey', 'secretValue')
        const retrievedValue = await secretStorage.get('testKey')
        expect(retrievedValue).toBe('secretValue')
    })

    it('should return undefined for non-existent keys', async () => {
        const retrievedValue = await secretStorage.get('nonExistentKey')
        expect(retrievedValue).toBeUndefined()
    })

    it('should update existing secrets', async () => {
        await secretStorage.store('updateKey', 'initialSecret')
        await secretStorage.store('updateKey', 'updatedSecret')
        const retrievedValue = await secretStorage.get('updateKey')
        expect(retrievedValue).toBe('updatedSecret')
    })

    it('should delete secrets', async () => {
        await secretStorage.store('deleteKey', 'secretToDelete')
        await secretStorage.delete('deleteKey')
        const retrievedValue = await secretStorage.get('deleteKey')
        expect(retrievedValue).toBeUndefined()
    })

    it('should handle empty string as a valid secret', async () => {
        await secretStorage.store('emptyKey', '')
        const retrievedValue = await secretStorage.get('emptyKey')
        expect(retrievedValue).toBe('')
    })

    it('should use in-memory storage when no key is provided', async () => {
        const inMemoryStorage = new AgentSecretStorage()
        await inMemoryStorage.store('inMemoryKey', 'inMemoryValue')
        const retrievedValue = await inMemoryStorage.get('inMemoryKey')
        expect(retrievedValue).toBe('inMemoryValue')
    })

    it('should use encrypted local storage when a key is provided', async () => {
        const encryptedStorage = new AgentSecretStorage('encryptionKey')
        await encryptedStorage.store('encryptedKey', 'encryptedValue')
        const retrievedValue = await encryptedStorage.get('encryptedKey')
        expect(retrievedValue).toBe('encryptedValue')
    })
})
