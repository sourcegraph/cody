import type { SerializedChatTranscript, UserLocalHistory } from '@sourcegraph/cody-shared'
import { MOCK_API, useExtensionAPI } from '@sourcegraph/prompt-editor'
import { fileSave } from 'browser-fs-access'
import { Observable } from 'observable-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadChatHistory } from './downloadChatHistory'

// Mock the useExtensionAPI function
vi.mock('@sourcegraph/prompt-editor', () => ({
    MOCK_API: {},
    useExtensionAPI: vi.fn(),
}))

vi.mock('browser-fs-access', () => ({
    fileSave: vi.fn(),
}))

describe('downloadChatHistory', () => {
    // Setup mocks before each test
    beforeEach(() => {
        // Mock date for consistent timestamp in filename
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2025-04-01T12:34:56Z'))
    })

    // Restore original functions after each test
    afterEach(() => {
        vi.useRealTimers()
        vi.resetAllMocks()
        vi.resetModules()
    })

    it('should download chat history as a JSON file with correct filename', async () => {
        // Mock chat history data
        const mockChatHistory: SerializedChatTranscript[] = [
            {
                id: 'chat-1',
                interactions: [
                    {
                        humanMessage: {
                            text: 'Hello',
                            speaker: 'human',
                        },
                        assistantMessage: {
                            text: 'Hi there!',
                            speaker: 'assistant',
                        },
                    },
                ],
                lastInteractionTimestamp: '2025-03-30T10:00:00Z',
            },
        ]

        const mockUserHistory: UserLocalHistory = {
            chat: {
                'chat-1': mockChatHistory[0],
            },
        }

        // Mock extension API
        const mockExtensionAPI = {
            ...MOCK_API,
            userHistory: () => Observable.of(mockUserHistory),
        }
        vi.mocked(useExtensionAPI).mockImplementation(() => mockExtensionAPI)

        const mockSaveFn = vi.fn()
        vi.mocked(fileSave).mockImplementation(mockSaveFn)

        // Call the function
        await downloadChatHistory(useExtensionAPI())

        expect(mockSaveFn).toHaveBeenCalledTimes(1)
        expect(mockSaveFn).toHaveBeenCalledWith(
            expect.any(Blob),
            expect.objectContaining({
                fileName: 'cody-chat-history-2025-04-01T12-34-56.json',
            })
        )
    })

    it('should not download anything if chat history is empty', async () => {
        // Mock empty chat history
        const mockUserHistory: UserLocalHistory = {
            chat: {},
        }

        // Mock extension API
        const mockExtensionAPI = {
            userHistory: () => Observable.of(mockUserHistory),
        }

        const mockSaveFn = vi.fn()
        vi.mocked(fileSave).mockImplementation(mockSaveFn)

        // Call the function
        await downloadChatHistory(mockExtensionAPI)

        // Verify no download was attempted
        expect(mockSaveFn).not.toHaveBeenCalled()
    })

    it('should not download anything if user history is null', async () => {
        // Mock null user history
        const mockExtensionAPI = {
            ...MOCK_API,
            userHistory: () => Observable.of(null),
        }
        vi.mocked(useExtensionAPI).mockImplementation(() => mockExtensionAPI)

        const mockSaveFn = vi.fn()
        vi.mocked(fileSave).mockImplementation(mockSaveFn)

        // Call the function
        await downloadChatHistory(useExtensionAPI())

        // Verify no download was attempted
        expect(mockSaveFn).not.toHaveBeenCalled()
    })
})
