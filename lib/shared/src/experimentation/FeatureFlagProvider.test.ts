import { describe, expect, it, vitest } from 'vitest'

import type { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

import { readValuesFrom } from '../misc/observable'
import { nextTick } from '../utils'
import { FeatureFlag, FeatureFlagProvider } from './FeatureFlagProvider'

describe('FeatureFlagProvider', () => {
    it('evaluates the feature flag on dotcom', async () => {
        const apiClient = {
            getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({}),
            evaluateFeatureFlag: vitest.fn().mockResolvedValue(true),
        } as unknown as SourcegraphGraphQLAPIClient

        const provider = new FeatureFlagProvider(apiClient)

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
    })

    it('loads all evaluated feature flag on `syncAuthStatus`', async () => {
        const apiClient = {
            getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: true,
            }),
            evaluateFeatureFlag: vitest.fn(),
        }

        const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)
        await provider.refresh()

        // Wait for the async initialization
        await nextTick()

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
        expect(apiClient.getEvaluatedFeatureFlags).toHaveBeenCalled()
        expect(apiClient.evaluateFeatureFlag).not.toHaveBeenCalled()
    })

    it('should handle API errors', async () => {
        const apiClient = {
            getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue(new Error('API error')),
            evaluateFeatureFlag: vitest.fn().mockResolvedValue(new Error('API error')),
        }

        const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(false)
    })

    it('should refresh flags', async () => {
        const apiClient = {
            getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: true,
            }),
            evaluateFeatureFlag: vitest.fn(),
        }

        const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)

        // Wait for the async initialization
        await nextTick()

        apiClient.getEvaluatedFeatureFlags.mockResolvedValue({
            [FeatureFlag.TestFlagDoNotUse]: false,
        })

        await provider.refresh()

        // Wait for the async reload
        await nextTick()

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(false)
    })

    it('should refresh flags after one hour', async () => {
        const originalNow = Date.now
        try {
            Date.now = () => 0
            const apiClient = {
                getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                    [FeatureFlag.TestFlagDoNotUse]: true,
                }),
                evaluateFeatureFlag: vitest.fn(),
            }

            const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)
            await provider.refresh()

            // Wait for the async initialization
            await nextTick()

            expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
            expect(apiClient.getEvaluatedFeatureFlags).toHaveBeenCalled()
            expect(apiClient.evaluateFeatureFlag).not.toHaveBeenCalled()

            apiClient.getEvaluatedFeatureFlags = vitest.fn().mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })

            Date.now = () => 61 * 60 * 1000

            // We have a stale-while-revalidate cache so this will return the previous value while it
            // is reloading
            expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
            expect(apiClient.getEvaluatedFeatureFlags).toHaveBeenCalled()
            expect(apiClient.evaluateFeatureFlag).not.toHaveBeenCalled()

            // Wait for the async reload
            await nextTick()

            expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(false)
        } finally {
            Date.now = originalNow
        }
    })

    describe('evaluatedFeatureFlag', () => {
        async function testEvaluatedFeatureFlag({
            apiClient,
            expectInitialValues,
            update,
            expectFinalValues,
        }: {
            apiClient: Pick<
                SourcegraphGraphQLAPIClient,
                'getEvaluatedFeatureFlags' | 'evaluateFeatureFlag'
            >
            expectInitialValues: (boolean | undefined)[]
            update?: (
                mockAPIClient: { [K in keyof typeof apiClient]: ReturnType<typeof vitest.fn> }
            ) => void
            expectFinalValues?: (boolean | undefined)[]
        }): Promise<void> {
            vitest.useFakeTimers()
            const provider = new FeatureFlagProvider({
                ...apiClient,
                endpoint: 'http://example.com',
            } as SourcegraphGraphQLAPIClient)

            const flag$ = provider.evaluatedFeatureFlag(FeatureFlag.TestFlagDoNotUse)

            const { values, done, unsubscribe } = readValuesFrom(flag$)
            vitest.runAllTimers()

            // Test the initial emissions.
            await nextTick()
            expect(values).toEqual<typeof values>(expectInitialValues)
            values.length = 0

            if (!update) {
                return
            }

            // Test that the observable emits updated values when flags change.
            update(apiClient as any)
            provider.refresh()
            await nextTick()
            expect(values).toEqual<typeof values>(expectFinalValues!)
            values.length = 0

            // Ensure there are no emissions after unsubscribing.
            unsubscribe()
            await done
            expect(values).toEqual<typeof values>([])
        }

        it('should emit when a new flag is evaluated', { timeout: 1000 }, () =>
            testEvaluatedFeatureFlag({
                apiClient: {
                    getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({}),
                    evaluateFeatureFlag: vitest.fn().mockResolvedValue(false),
                },
                expectInitialValues: [undefined, false],
            })
        )

        it('should emit when value changes from true to false', { timeout: 1000 }, () =>
            testEvaluatedFeatureFlag({
                apiClient: {
                    getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                        [FeatureFlag.TestFlagDoNotUse]: true,
                    }),
                    evaluateFeatureFlag: vitest.fn().mockResolvedValue(true),
                },
                expectInitialValues: [true],
                update: apiClient => {
                    apiClient.getEvaluatedFeatureFlags.mockResolvedValue({
                        [FeatureFlag.TestFlagDoNotUse]: false,
                    })
                    apiClient.evaluateFeatureFlag.mockResolvedValue(false)
                },
                expectFinalValues: [false],
            })
        )

        it('should emit when value changes from false to true', { timeout: 1000 }, () =>
            testEvaluatedFeatureFlag({
                apiClient: {
                    getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                        [FeatureFlag.TestFlagDoNotUse]: false,
                    }),
                    evaluateFeatureFlag: vitest.fn().mockResolvedValue(false),
                },
                expectInitialValues: [false],
                update: apiClient => {
                    apiClient.getEvaluatedFeatureFlags.mockResolvedValue({
                        [FeatureFlag.TestFlagDoNotUse]: true,
                    })
                    apiClient.evaluateFeatureFlag.mockResolvedValue(true)
                },
                expectFinalValues: [true],
            })
        )

        it(
            'should emit undefined when a previously false flag is no longer in the exposed list',
            { timeout: 1000 },
            () =>
                testEvaluatedFeatureFlag({
                    apiClient: {
                        getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                            [FeatureFlag.TestFlagDoNotUse]: false,
                        }),
                        evaluateFeatureFlag: vitest.fn().mockResolvedValue(false),
                    },
                    expectInitialValues: [false],
                    update: apiClient => {
                        apiClient.getEvaluatedFeatureFlags.mockResolvedValue({})
                        apiClient.evaluateFeatureFlag.mockResolvedValue(null)
                    },
                    expectFinalValues: [undefined],
                })
        )
    })
})
