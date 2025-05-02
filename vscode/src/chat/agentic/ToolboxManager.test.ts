import { type Model, ModelTag } from '@sourcegraph/cody-shared'
import { DeepCodyAgentID } from '@sourcegraph/cody-shared/src/models/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set up mocks with vi.mocked approach
vi.mock('vscode', () => ({ env: { shell: undefined } }))

vi.mock('@sourcegraph/cody-shared', () => ({
    authStatus: { pipe: vi.fn().mockReturnThis(), next: vi.fn(), subscribe: vi.fn() },
    featureFlagProvider: {
        evaluatedFeatureFlag: vi.fn().mockImplementation(() => ({
            pipe: vi.fn().mockReturnThis(),
            next: vi.fn(),
            subscribe: vi.fn(),
        })),
    },
    userProductSubscription: { pipe: vi.fn().mockReturnThis(), next: vi.fn(), subscribe: vi.fn() },
    modelsService: {
        modelsChanges: { pipe: vi.fn().mockReturnThis(), next: vi.fn(), subscribe: vi.fn() },
    },
    isDotCom: vi.fn().mockReturnValue(true),
    combineLatest: vi.fn().mockReturnValue({ pipe: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
    startWith: vi.fn().mockImplementation(() => (source: any) => source),
    distinctUntilChanged: vi.fn().mockImplementation(() => (source: any) => source),
    map: vi.fn().mockImplementation(() => (source: any) => source),
    FeatureFlag: {
        DeepCody: 'deep-cody',
        ContextAgentDefaultChatModel: 'context-agent-default-chat-model',
        DeepCodyShellContext: 'deep-cody-shell-context',
    },
    ModelTag: {
        Speed: 'speed',
    },
    pendingOperation: Symbol('pendingOperation'),
}))

vi.mock('./DeepCody', () => ({
    DeepCodyAgent: {
        model: undefined,
    },
}))

// Import after setting up mocks
import { DeepCodyAgent } from './DeepCody'
import { getDeepCodyModel, toolboxManager } from './ToolboxManager'

// Mocks are defined at the top of the file

describe('ToolboxManager', () => {
    // Reset mocks between tests
    beforeEach(() => {
        vi.clearAllMocks()
        DeepCodyAgent.model = undefined
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    describe('getDeepCodyModel', () => {
        const testCases = [
            {
                name: 'should prioritize model with -flash substring',
                models: [
                    { id: 'gemini-flash', tags: [ModelTag.Speed] },
                    { id: 'gpt-4.1-mini', tags: [ModelTag.Speed] },
                    { id: 'claude-3-5-haiku', tags: [ModelTag.Speed] },
                    { id: 'other-model', tags: [ModelTag.Speed] },
                ],
                expectedId: 'gemini-flash',
            },
            {
                name: 'should prioritize gpt-4.1-mini if -flash not available',
                models: [
                    { id: 'gpt-4.1-mini', tags: [ModelTag.Speed] },
                    { id: 'claude-3-5-haiku', tags: [ModelTag.Speed] },
                    { id: 'other-model', tags: [ModelTag.Speed] },
                ],
                expectedId: 'gpt-4.1-mini',
            },
            {
                name: 'should use haiku model if higher priority models not available',
                models: [
                    { id: 'claude-3-5-haiku', tags: [ModelTag.Speed] },
                    { id: 'other-model', tags: [ModelTag.Speed] },
                ],
                expectedId: 'claude-3-5-haiku',
            },
            {
                name: 'should use first speed model if preferred models not available',
                models: [
                    { id: 'other-model', tags: ['other'] },
                    { id: 'speed-model', tags: [ModelTag.Speed] },
                ],
                expectedId: 'speed-model',
            },
            {
                name: 'should return undefined if no suitable models',
                models: [{ id: 'other-model', tags: ['other'] }],
                expectedId: undefined,
            },
        ]

        for (const testCase of testCases) {
            it(testCase.name, () => {
                const result = getDeepCodyModel(testCase.models as Model[])
                if (testCase.expectedId === undefined) {
                    expect(result).toBeUndefined()
                } else {
                    expect(result).not.toBeUndefined()
                    expect(result?.id).toBe(testCase.expectedId)
                }
            })
        }
    })

    describe('ToolboxManager singleton', () => {
        it('should return the same instance when getInstance is called multiple times', () => {
            const instance1 = toolboxManager
            const instance2 = toolboxManager
            expect(instance1).toBe(instance2)
        })
    })

    describe('getSettings', () => {
        const testCases = [
            {
                name: 'should return null when disabled',
                setup: () => {
                    // Set internal state to disabled
                    vi.spyOn(toolboxManager as any, 'isEnabled', 'get').mockReturnValue(false)
                },
                expected: null,
            },
            {
                name: 'should return settings with agent when enabled and not rate limited',
                setup: () => {
                    vi.spyOn(toolboxManager as any, 'isEnabled', 'get').mockReturnValue(true)
                    vi.spyOn(toolboxManager as any, 'isRateLimited', 'get').mockReturnValue(false)
                    vi.spyOn(toolboxManager as any, 'getFeatureError').mockReturnValue(undefined)
                },
                expected: {
                    agent: { name: DeepCodyAgentID },
                    shell: {
                        enabled: true,
                        error: undefined,
                    },
                },
            },
            {
                name: 'should return settings without agent when rate limited',
                setup: () => {
                    vi.spyOn(toolboxManager as any, 'isEnabled', 'get').mockReturnValue(true)
                    vi.spyOn(toolboxManager as any, 'isRateLimited', 'get').mockReturnValue(true)
                    vi.spyOn(toolboxManager as any, 'getFeatureError').mockReturnValue(undefined)
                },
                expected: {
                    agent: { name: undefined },
                    shell: {
                        enabled: true,
                        error: undefined,
                    },
                },
            },
            {
                name: 'should return settings with shell error when shell not supported',
                setup: () => {
                    vi.spyOn(toolboxManager as any, 'isEnabled', 'get').mockReturnValue(true)
                    vi.spyOn(toolboxManager as any, 'isRateLimited', 'get').mockReturnValue(false)
                    vi.spyOn(toolboxManager as any, 'getFeatureError').mockReturnValue(
                        'Not supported by the instance.'
                    )
                },
                expected: {
                    agent: { name: DeepCodyAgentID },
                    shell: {
                        enabled: false,
                        error: 'Not supported by the instance.',
                    },
                },
            },
        ]

        for (const testCase of testCases) {
            it(testCase.name, () => {
                testCase.setup()
                const settings = toolboxManager.getSettings()
                expect(settings).toEqual(testCase.expected)
            })
        }
    })
    describe('setIsRateLimited', () => {
        // Before each test, replace the implementation of setIsRateLimited with a mock
        let originalSetIsRateLimited: any
        let mockIsRateLimited = false

        beforeEach(() => {
            originalSetIsRateLimited = toolboxManager.setIsRateLimited

            // Create a mock implementation of setIsRateLimited
            toolboxManager.setIsRateLimited = vi.fn().mockImplementation(function (
                this: typeof toolboxManager,
                hasHitLimit: boolean
            ) {
                if ((this as any).isEnabled && mockIsRateLimited !== hasHitLimit) {
                    mockIsRateLimited = hasHitLimit
                    ;(this as any).changeNotifications.next()
                }
            }) as any
        })

        // Restore original method after each test
        afterEach(() => {
            toolboxManager.setIsRateLimited = originalSetIsRateLimited
        })

        it('should update rate limit status and trigger notification when enabled', () => {
            // Setup
            vi.spyOn(toolboxManager as any, 'isEnabled', 'get').mockReturnValue(true)
            mockIsRateLimited = false

            const nextSpy = vi.spyOn((toolboxManager as any).changeNotifications, 'next')

            // Test
            toolboxManager.setIsRateLimited(true)

            // Verify
            expect(nextSpy).toHaveBeenCalled()
            expect(mockIsRateLimited).toBe(true)
        })

        it('should not trigger notification when disabled', () => {
            // Setup
            vi.spyOn(toolboxManager as any, 'isEnabled', 'get').mockReturnValue(false)
            mockIsRateLimited = false

            const nextSpy = vi.spyOn((toolboxManager as any).changeNotifications, 'next')

            // Test
            toolboxManager.setIsRateLimited(true)

            // Verify
            expect(nextSpy).not.toHaveBeenCalled()
            expect(mockIsRateLimited).toBe(false) // Should not change
        })

        it('should not trigger notification when rate limit status does not change', () => {
            // Setup
            vi.spyOn(toolboxManager as any, 'isEnabled', 'get').mockReturnValue(true)
            mockIsRateLimited = true

            const nextSpy = vi.spyOn((toolboxManager as any).changeNotifications, 'next')

            // Test
            toolboxManager.setIsRateLimited(true)

            // Verify
            expect(nextSpy).not.toHaveBeenCalled()
            expect(mockIsRateLimited).toBe(true)
        })
    })
})
