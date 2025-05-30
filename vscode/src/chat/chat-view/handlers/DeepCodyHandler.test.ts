import { type Model, ModelTag } from '@sourcegraph/cody-shared'
import { DeepCodyAgentID } from '@sourcegraph/cody-shared/src/models/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Set up mocks with vi.mocked approach
vi.mock('vscode', async () => {
    const { vsCodeMocks } = await import('../../../testutils/mocks')
    return vsCodeMocks
})

import { DeepCodyHandler, getDeepCodyModel } from './DeepCodyHandler'

vi.mock('@sourcegraph/cody-shared', async (importOriginal) => {
    const actual = (await importOriginal()) as any
    return {
        ...actual,
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
        resolvedConfig: { pipe: vi.fn().mockReturnThis(), next: vi.fn(), subscribe: vi.fn() },
    }
})

vi.mock('./DeepCody', async importOriginal => {
    const actual = (await importOriginal()) as any
    return {
        ...actual,
        DeepCodyAgent: {
            model: undefined,
            getInstance: vi.fn().mockReturnValue({
                getSettings: vi.fn(),
                isAgenticChatEnabled: vi.fn(),
                observable: { pipe: vi.fn().mockReturnThis(), subscribe: vi.fn() },
            }),
        },
    }
})

// Mocks are defined at the top of the file

describe('ToolboxManager', () => {
    // Reset mocks between tests
    beforeEach(() => {
        vi.clearAllMocks()
        DeepCodyHandler.model = undefined
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

    describe('getSettings', () => {
        const testCases = [
            {
                name: 'should return null when disabled',
                setup: () => {
                    // Set internal state to disabled
                    vi.spyOn(DeepCodyHandler as any, 'isToolboxEnabled', 'get').mockReturnValue(false)
                },
                expected: null,
            },
            {
                name: 'should return settings with agent when enabled and not rate limited',
                setup: () => {
                    vi.spyOn(DeepCodyHandler as any, 'isToolboxEnabled', 'get').mockReturnValue(true)
                    vi.spyOn(DeepCodyHandler as any, 'getFeatureError').mockReturnValue(undefined)
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
                name: 'should return settings with shell error when shell not supported',
                setup: () => {
                    vi.spyOn(DeepCodyHandler as any, 'isToolboxEnabled', 'get').mockReturnValue(true)
                    vi.spyOn(DeepCodyHandler as any, 'getFeatureError').mockReturnValue(
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
                const settings = DeepCodyHandler.getSettings()
                expect(settings).toEqual(testCase.expected)
            })
        }
    })
})
