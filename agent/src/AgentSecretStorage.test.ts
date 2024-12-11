import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { AgentClientManagedSecretStorage } from './AgentSecretStorage'
import type { MessageHandler } from './jsonrpc-alias'

describe('AgentClientManagedSecretStorage', () => {
    let secretStorage: AgentClientManagedSecretStorage
    let mockAgent: { request: ReturnType<typeof vi.fn> }
    let mockEventEmitter: vscode.EventEmitter<vscode.SecretStorageChangeEvent>

    beforeEach(() => {
        mockAgent = {
            request: vi.fn(),
        }
        mockEventEmitter = new vscode.EventEmitter<vscode.SecretStorageChangeEvent>()
        secretStorage = new AgentClientManagedSecretStorage(
            mockAgent as unknown as MessageHandler,
            mockEventEmitter
        )
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('get', () => {
        it('returns undefined when agent returns null', async () => {
            mockAgent.request.mockResolvedValueOnce(null)
            const result = await secretStorage.get('test-key')
            expect(result).toBeUndefined()
            expect(mockAgent.request).toHaveBeenCalledWith('secrets/get', { key: 'test-key' })
        })

        it('returns value when agent returns a value', async () => {
            mockAgent.request.mockResolvedValueOnce('secret-value')
            const result = await secretStorage.get('test-key')
            expect(result).toBe('secret-value')
            expect(mockAgent.request).toHaveBeenCalledWith('secrets/get', { key: 'test-key' })
        })
    })

    describe('store', () => {
        it('stores value and fires change event', async () => {
            const fireSpy = vi.spyOn(mockEventEmitter, 'fire')
            await secretStorage.store('test-key', 'test-value')
            expect(mockAgent.request).toHaveBeenCalledWith('secrets/store', {
                key: 'test-key',
                value: 'test-value',
            })
            expect(fireSpy).toHaveBeenCalledWith({ key: 'test-key' })
        })

        it('handles empty string value', async () => {
            const fireSpy = vi.spyOn(mockEventEmitter, 'fire')
            await secretStorage.store('test-key', '')
            expect(mockAgent.request).toHaveBeenCalledWith('secrets/store', {
                key: 'test-key',
                value: '',
            })
            expect(fireSpy).toHaveBeenCalledWith({ key: 'test-key' })
        })
    })

    describe('delete', () => {
        it('deletes value and fires change event', async () => {
            const fireSpy = vi.spyOn(mockEventEmitter, 'fire')
            await secretStorage.delete('test-key')
            expect(mockAgent.request).toHaveBeenCalledWith('secrets/delete', { key: 'test-key' })
            expect(fireSpy).toHaveBeenCalledWith({ key: 'test-key' })
        })
    })
})
