import type { AccountKeyedChatHistory } from '@sourcegraph/cody-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import { migrateChatHistoryCODY3538 } from './chat-id-migration-CODY3538'

class MockMemento implements vscode.Memento {
    public data: { [key: string]: unknown } = {}

    keys(): readonly string[] {
        return Object.keys(this.data)
    }

    get<T>(key: string): T | undefined {
        return this.data[key] as T
    }

    async update(key: string, value: unknown): Promise<void> {
        this.data[key] = value
    }
}

describe('migrateChatHistoryCODY3538', () => {
    let storage: vscode.Memento
    beforeEach(() => {
        storage = new MockMemento()
    })

    it('should not migrate if already migrated', async () => {
        const storage = {
            get: vi.fn().mockReturnValue(true),
            update: vi.fn(),
        } as unknown as vscode.Memento

        await migrateChatHistoryCODY3538(storage)

        expect(storage.get).toHaveBeenCalledWith(MIGRATION_MARKER)
        expect(storage.update).not.toHaveBeenCalled()
    })

    it('should migrate UUID chat IDs to UTC string format', async () => {
        const mockHistory: AccountKeyedChatHistory = {
            'endpoint-account1': {
                chat: {
                    '46147b93-a7eb-4b24-bef3-5b1acf23a8ed': {
                        id: '46147b93-a7eb-4b24-bef3-5b1acf23a8ed',
                        lastInteractionTimestamp: '2023-05-01T12:00:00.000Z',
                        interactions: [],
                    },
                },
            },
        }

        await storage.update(LOCAL_HISTORY, mockHistory)

        await migrateChatHistoryCODY3538(storage)

        expect(storage.get(MIGRATION_MARKER)).toBe(true)

        const updatedHistory = storage.get(LOCAL_HISTORY) as AccountKeyedChatHistory
        expect(updatedHistory).toBeDefined()

        const [newChat] = Object.values(updatedHistory['endpoint-account1'].chat)
        expect(Date.parse(newChat.id)).toBe(1682942400000)
        expect(newChat.lastInteractionTimestamp).toBe(newChat.id)
    })

    it('should handle invalid lastInteractionTimestamp', async () => {
        const mockHistory: AccountKeyedChatHistory = {
            'endpoint-account1': {
                chat: {
                    '46147b93-a7eb-4b24-bef3-5b1acf23a8ed': {
                        id: '46147b93-a7eb-4b24-bef3-5b1acf23a8ed',
                        lastInteractionTimestamp: '46147b93-a7eb-4b24-bef3-5b1acf23a8ed',
                        interactions: [],
                    },
                },
            },
        }

        await storage.update(LOCAL_HISTORY, mockHistory)

        await migrateChatHistoryCODY3538(storage)

        const updatedHistory = storage.get<AccountKeyedChatHistory>(LOCAL_HISTORY)
        const [newChat] = Object.values(updatedHistory?.['endpoint-account1'].chat ?? {})
        expect(Number.isNaN(Date.parse(newChat.lastInteractionTimestamp))).toBe(false)
    })

    it('should not modify non-UUID chat IDs', async () => {
        const mockHistory = {
            account1: {
                chat: {
                    'non-uuid-id': {
                        id: 'non-uuid-id',
                        lastInteractionTimestamp: '2023-05-01T12:00:00.000Z',
                    },
                },
            },
        }
        await storage.update(LOCAL_HISTORY, mockHistory)

        await migrateChatHistoryCODY3538(storage)
        expect(storage.get(MIGRATION_MARKER)).toBe(true)
        expect(storage.get(LOCAL_HISTORY)).toBe(mockHistory)
    })
})

const MIGRATION_MARKER = 'migrated-chat-history-cody-3538'

const LOCAL_HISTORY = 'cody-local-chatHistory-v2'
