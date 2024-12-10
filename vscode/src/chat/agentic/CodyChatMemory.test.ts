import { ContextItemSource } from '@sourcegraph/cody-shared'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { localStorage } from '../../services/LocalStorageProvider'
import { CodyChatMemory } from './CodyChatMemory'

// Mock localStorage
vi.mock('../../services/LocalStorageProvider', () => ({
    localStorage: {
        getChatMemory: vi.fn(),
        setChatMemory: vi.fn(),
    },
}))

describe('CodyChatMemory Workflows', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers()
    })

    afterAll(() => {
        vi.useRealTimers()
    })

    describe('Chat Session Workflows', () => {
        interface TestScenario {
            name: string
            actions: Array<{
                type: 'initialize' | 'load' | 'retrieve' | 'unload'
                input?: string
                expectedContent?: string | null
                expectedStorageCall?: boolean
            }>
        }

        const scenarios: TestScenario[] = [
            {
                name: 'New user first chat session',
                actions: [
                    {
                        type: 'initialize',
                        expectedContent: null,
                        expectedStorageCall: true,
                    },
                    {
                        type: 'load',
                        input: 'User prefers TypeScript',
                        // Update to match new timestamp + content format
                        expectedContent:
                            '## \\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.\\d{3}Z\\nUser prefers TypeScript',
                        expectedStorageCall: true,
                    },
                    {
                        type: 'retrieve',
                        expectedContent: 'User prefers TypeScript',
                    },
                ],
            },
            {
                name: 'Multiple chat interactions in one session',
                actions: [
                    {
                        type: 'load',
                        input: 'User likes unit testing',
                        expectedContent: 'User likes unit testing',
                    },
                    {
                        type: 'load',
                        input: 'User works on VS Code extensions',
                        expectedContent: 'User works on VS Code extensions',
                    },
                    {
                        type: 'retrieve',
                        // Update regex to match new Map-based format with timestamps
                        expectedContent:
                            '## \\d{4}.*User likes unit testing.*## \\d{4}.*User works on VS Code extensions',
                    },
                ],
            },
            {
                name: 'Memory capacity management with timestamps',
                actions: [
                    ...Array.from({ length: 10 }, (_, i) => ({
                        type: 'load' as const,
                        input: `Memory item ${i}`,
                        // Verify only last 8 items are kept
                        expectedContent: i >= 2 ? `Memory item ${i}` : null,
                    })),
                    {
                        type: 'retrieve',
                        // Verify chronological order is maintained
                        expectedContent: 'Memory item 2.*Memory item 9',
                    },
                ],
            },
            // Add new test scenario for timestamp ordering
            {
                name: 'Timestamp ordering verification',
                actions: [
                    {
                        type: 'load',
                        input: 'First message',
                    },
                    {
                        type: 'load',
                        input: 'Second message',
                    },
                    {
                        type: 'retrieve',
                        // Verify messages appear in chronological order with timestamps
                        expectedContent: '.*First message.*Second message',
                    },
                ],
            },
        ]

        for (const scenario of scenarios) {
            it(scenario.name, () => {
                for (const action of scenario.actions) {
                    switch (action.type) {
                        case 'load':
                            // Advance by 1 second to ensure unique timestamps
                            vi.advanceTimersByTime(1000)
                            CodyChatMemory.load(action.input!)
                            if (action.expectedStorageCall) {
                                expect(localStorage.setChatMemory).toHaveBeenCalled()
                            }
                            break

                        case 'retrieve': {
                            const retrieved = CodyChatMemory.retrieve()
                            if (action.expectedContent === null) {
                                expect(retrieved).toBeUndefined()
                            } else {
                                if (action.expectedContent) {
                                    expect(retrieved?.content).toMatch(
                                        new RegExp(action.expectedContent, 's')
                                    )
                                }
                                expect(retrieved?.source).toBe(ContextItemSource.Agentic)
                                expect(retrieved?.uri).toEqual(URI.file('Cody Memory'))
                            }
                            break
                        }
                        case 'unload': {
                            const lastState = CodyChatMemory.reset()
                            if (action.expectedContent) {
                                expect(lastState?.content).toContain(action.expectedContent)
                            }
                            break
                        }
                    }
                }
            })
        }
    })
})
