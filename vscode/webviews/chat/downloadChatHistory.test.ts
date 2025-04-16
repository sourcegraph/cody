import type { SerializedChatTranscript, UserLocalHistory } from '@sourcegraph/cody-shared'
import { MOCK_API, useExtensionAPI } from '@sourcegraph/prompt-editor'
import { Observable } from 'observable-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadChatHistory } from './downloadChatHistory'

// Mock document and URL objects before they're used
global.document = { createElement: vi.fn() } as any
global.URL = { createObjectURL: vi.fn(), revokeObjectURL: vi.fn() } as any

// Mock the useExtensionAPI function
vi.mock('@sourcegraph/prompt-editor', () => ({
    MOCK_API: {},
    useExtensionAPI: vi.fn(),
}))

describe('downloadChatHistory', () => {
    // Mock DOM APIs
    const originalCreateElement = document.createElement
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL

    // Mock elements and functions
    let mockAnchor: HTMLAnchorElement
    let mockObjectURL: string
    let mockClickFn = vi.fn()

    // Setup mocks before each test
    beforeEach(() => {
        // Mock date for consistent timestamp in filename
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2025-04-01T12:34:56Z'))

        // Mock anchor element
        mockClickFn = vi.fn()
        mockAnchor = {
            href: '',
            download: '',
            target: '',
            click: mockClickFn,
        } as unknown as HTMLAnchorElement

        // Mock URL.createObjectURL
        mockObjectURL = 'blob:mock-url'
        URL.createObjectURL = vi.fn().mockReturnValue(mockObjectURL)
        URL.revokeObjectURL = vi.fn()

        // Mock document.createElement
        document.createElement = vi.fn().mockImplementation((tagName: string) => {
            if (tagName === 'a') {
                return mockAnchor
            }
            return originalCreateElement.call(document, tagName)
        })
    })

    // Restore original functions after each test
    afterEach(() => {
        vi.useRealTimers()
        document.createElement = originalCreateElement
        URL.createObjectURL = originalCreateObjectURL
        URL.revokeObjectURL = originalRevokeObjectURL
        vi.resetAllMocks()
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

        // Call the function
        await downloadChatHistory(useExtensionAPI())

        // Verify Blob was created with correct content
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
        // Verify anchor element was configured correctly
        expect(mockAnchor.href).toBe(mockObjectURL)
        expect(mockAnchor.download).toBe('cody-chat-history-2025-04-01T12-34-56.json')
        expect(mockAnchor.target).toBe('_blank')

        // Verify click was called to trigger download
        expect(mockClickFn).toHaveBeenCalledTimes(1)
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

        // Call the function
        await downloadChatHistory(mockExtensionAPI)

        // Verify no download was attempted
        expect(URL.createObjectURL).not.toHaveBeenCalled()
        expect(mockClickFn).not.toHaveBeenCalled()
    })

    it('should not download anything if user history is null', async () => {
        // Mock null user history
        const mockExtensionAPI = {
            ...MOCK_API,
            userHistory: () => Observable.of(null),
        }
        vi.mocked(useExtensionAPI).mockImplementation(() => mockExtensionAPI)

        // Call the function
        await downloadChatHistory(useExtensionAPI())

        // Verify no download was attempted
        expect(URL.createObjectURL).not.toHaveBeenCalled()
        expect(mockClickFn).not.toHaveBeenCalled()
    })
})
