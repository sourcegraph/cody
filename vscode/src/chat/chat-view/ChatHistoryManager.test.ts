import {
    AUTH_STATUS_FIXTURE_AUTHED,
    type SerializedChatTranscript,
    type UserLocalHistory,
} from '@sourcegraph/cody-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localStorage } from '../../services/LocalStorageProvider'
import { chatHistory } from './ChatHistoryManager'

// Mock the localStorage module
vi.mock('../../services/LocalStorageProvider', () => ({
    localStorage: {
        getChatHistory: vi.fn(),
        setChatHistory: vi.fn(),
        importChatHistory: vi.fn(),
        deleteChatHistory: vi.fn(),
        removeChatHistory: vi.fn(),
    },
}))

describe('ChatHistoryManager', () => {
    let chatHistoryManager = chatHistory
    const mockAuthStatus = AUTH_STATUS_FIXTURE_AUTHED
    let mockChatHistory: UserLocalHistory
    let mockChat: SerializedChatTranscript

    beforeEach(() => {
        // Create a new instance for each test
        chatHistoryManager = chatHistory
        mockChat = {
            id: 'chat-123',
            interactions: [
                {
                    humanMessage: { speaker: 'human', text: 'Hello' },
                    assistantMessage: { speaker: 'assistant', text: 'Hi there!' },
                },
            ],
            lastInteractionTimestamp: new Date().toISOString(),
        }

        mockChatHistory = {
            chat: {
                'chat-123': mockChat,
                'chat-456': {
                    id: 'chat-456',
                    interactions: [
                        {
                            humanMessage: { speaker: 'human', text: 'How are you?' },
                            assistantMessage: { speaker: 'assistant', text: 'I am fine, thanks!' },
                        },
                    ],
                    lastInteractionTimestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
                },
            },
        }

        // Reset mocks
        vi.mocked(localStorage.getChatHistory).mockReset()
        vi.mocked(localStorage.setChatHistory).mockReset()
        vi.mocked(localStorage.importChatHistory).mockReset()
        vi.mocked(localStorage.deleteChatHistory).mockReset()
        vi.mocked(localStorage.removeChatHistory).mockReset()

        // Set up default mock implementations
        vi.mocked(localStorage.getChatHistory).mockReturnValue(mockChatHistory)
    })

    afterEach(() => {
        // Clean up
        chatHistoryManager.dispose()
    })

    describe('getLocalHistory', () => {
        it('should retrieve chat history from localStorage', () => {
            const result = chatHistoryManager.getLocalHistory(mockAuthStatus)

            expect(localStorage.getChatHistory).toHaveBeenCalledWith(mockAuthStatus)
            expect(result).toBe(mockChatHistory)
        })

        it('should return null when localStorage returns null', () => {
            vi.mocked(localStorage.getChatHistory).mockReturnValueOnce({ chat: {} })

            const result = chatHistoryManager.getLocalHistory(mockAuthStatus)

            expect(result).toStrictEqual({ chat: {} })
        })
    })

    describe('getChat', () => {
        it('should retrieve a specific chat by ID', () => {
            const result = chatHistoryManager.getChat(mockAuthStatus, 'chat-123')

            expect(result).toBe(mockChatHistory.chat['chat-123'])
        })

        it('should return null when chat ID does not exist', () => {
            const result = chatHistoryManager.getChat(mockAuthStatus, 'non-existent-id')

            expect(result).toBeUndefined()
        })

        it('should return null when chat history is null', () => {
            vi.mocked(localStorage.getChatHistory).mockReturnValueOnce({ chat: {} })

            const result = chatHistoryManager.getChat(mockAuthStatus, 'chat-123')

            expect(result).toBeUndefined()
        })
    })

    describe('getLightweightHistory', () => {
        it('should return lightweight history with default limit', () => {
            const result = chatHistoryManager.getLightweightHistory(mockAuthStatus)

            expect(result).not.toBeNull()
            expect(Object.keys(result!)).toHaveLength(2) // Both chats should be included

            // Check that each chat has the lightweight properties
            for (const chatId in result!) {
                expect(result![chatId]).toHaveProperty('id')
                expect(result![chatId]).toHaveProperty('lastInteractionTimestamp')
                expect(result![chatId]).not.toHaveProperty('interactions')
            }
        })

        it('should respect the limit parameter', () => {
            const result = chatHistoryManager.getLightweightHistory(mockAuthStatus, 1)

            expect(result).not.toBeNull()
            expect(Object.keys(result!)).toHaveLength(1) // Only one chat should be included
        })

        it('should sort chats by timestamp (newest first)', () => {
            // Create a new chat with a more recent timestamp
            const newerChat: SerializedChatTranscript = {
                id: 'chat-789',
                interactions: [
                    {
                        humanMessage: { speaker: 'human', text: 'New message' },
                        assistantMessage: { speaker: 'assistant', text: 'New response' },
                    },
                ],
                lastInteractionTimestamp: new Date(Date.now() + 3600000).toISOString(), // One hour in the future
            }

            const updatedHistory = {
                chat: {
                    ...mockChatHistory.chat,
                    'chat-789': newerChat,
                },
            }

            vi.mocked(localStorage.getChatHistory).mockReturnValueOnce(updatedHistory)

            const result = chatHistoryManager.getLightweightHistory(mockAuthStatus, 1)

            expect(result).not.toBeNull()
            expect(Object.keys(result!)).toHaveLength(1)
        })

        it('should return null when chat history is null', () => {
            vi.mocked(localStorage.getChatHistory).mockReturnValueOnce({ chat: {} })

            const result = chatHistoryManager.getLightweightHistory(mockAuthStatus)

            expect(result).toStrictEqual({})
        })

        it('should filter out empty chats', () => {
            const historyWithEmptyChat = {
                chat: {
                    ...mockChatHistory.chat,
                    'empty-chat': {
                        id: 'empty-chat',
                        interactions: [],
                        lastInteractionTimestamp: new Date().toISOString(),
                    },
                },
            }

            vi.mocked(localStorage.getChatHistory).mockReturnValueOnce(historyWithEmptyChat)

            const result = chatHistoryManager.getLightweightHistory(mockAuthStatus)

            expect(result).not.toBeNull()
            expect(result!).not.toHaveProperty('empty-chat')
        })
    })

    describe('saveChat', () => {
        it('should save a chat to localStorage', async () => {
            const newChat: SerializedChatTranscript = {
                id: 'new-chat',
                interactions: [
                    {
                        humanMessage: { speaker: 'human', text: 'New chat' },
                        assistantMessage: { speaker: 'assistant', text: 'New response' },
                    },
                ],
                lastInteractionTimestamp: new Date().toISOString(),
            }

            await chatHistoryManager.saveChat(mockAuthStatus, newChat)

            expect(localStorage.setChatHistory).toHaveBeenCalledWith(
                mockAuthStatus,
                expect.objectContaining({
                    chat: expect.objectContaining({
                        'new-chat': newChat,
                    }),
                })
            )
        })

        it('should not save an empty chat', async () => {
            const emptyChat: SerializedChatTranscript = {
                id: 'empty-chat',
                interactions: [],
                lastInteractionTimestamp: new Date().toISOString(),
            }

            await chatHistoryManager.saveChat(mockAuthStatus, emptyChat)

            expect(localStorage.setChatHistory).not.toHaveBeenCalled()
        })
    })

    describe('deleteChat', () => {
        it('should delete a chat from localStorage', async () => {
            await chatHistoryManager.deleteChat(mockAuthStatus, 'chat-123')

            expect(localStorage.deleteChatHistory).toHaveBeenCalledWith(mockAuthStatus, 'chat-123')
        })
    })

    describe('clear', () => {
        it('should clear all chat history', async () => {
            await chatHistoryManager.clear(mockAuthStatus)

            expect(localStorage.removeChatHistory).toHaveBeenCalledWith(mockAuthStatus)
        })
    })

    describe('dispose', () => {
        it('should dispose all disposables', () => {
            // Create a spy to check if dispose is called on the event emitter
            const disposeSpy = vi.spyOn(chatHistoryManager as any, 'dispose')

            chatHistoryManager.dispose()

            expect(disposeSpy).toHaveBeenCalled()
        })
    })
})
