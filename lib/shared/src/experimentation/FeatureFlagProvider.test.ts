import { beforeAll, describe, expect, it, vi, vitest } from 'vitest'

import { graphqlClient } from '../sourcegraph-api/graphql'

import { mockResolvedConfig } from '../configuration/resolver'
import { readValuesFrom } from '../misc/observable'
import { nextTick } from '../utils'
import { FeatureFlag, FeatureFlagProvider } from './FeatureFlagProvider'

vi.mock('../sourcegraph-api/graphql/client')

describe('FeatureFlagProvider', () => {
    beforeAll(() => {
        vi.useFakeTimers()
        mockResolvedConfig({
            auth: { accessToken: null, serverEndpoint: 'https://example.com' },
        })
    })

    async function newFeatureFlagProvider(): Promise<FeatureFlagProvider> {
        const provider = new FeatureFlagProvider()
        await vi.runOnlyPendingTimersAsync() // wait for `this.cachedServerEndpoint` to be set asynchronously
        return provider
    }

    it('evaluates the feature flag on dotcom', async () => {
        vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue({})
        vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(true)

        const provider = new FeatureFlagProvider()

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
    })

    it('loads all evaluated feature flag on `syncAuthStatus`', async () => {
        const getEvaluatedFeatureFlagsMock = vi
            .spyOn(graphqlClient, 'getEvaluatedFeatureFlags')
            .mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: true,
            })
        const evaluateFeatureFlagMock = vi.spyOn(graphqlClient, 'evaluateFeatureFlag')

        const provider = await newFeatureFlagProvider()
        await provider.refresh()

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
        expect(getEvaluatedFeatureFlagsMock).toHaveBeenCalled()
        expect(evaluateFeatureFlagMock).not.toHaveBeenCalled()
    })

    it('should handle API errors', async () => {
        vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue(new Error('API error'))
        vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(new Error('API error'))

        const provider = await newFeatureFlagProvider()

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(false)
    })

    it('should refresh flags', async () => {
        const getEvaluatedFeatureFlagsMock = vi
            .spyOn(graphqlClient, 'getEvaluatedFeatureFlags')
            .mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: true,
            })
        vi.spyOn(graphqlClient, 'evaluateFeatureFlag')

        const provider = await newFeatureFlagProvider()

        getEvaluatedFeatureFlagsMock.mockResolvedValue({
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
            const getEvaluatedFeatureFlagsMock = vi
                .spyOn(graphqlClient, 'getEvaluatedFeatureFlags')
                .mockResolvedValue({
                    [FeatureFlag.TestFlagDoNotUse]: true,
                })
            const evaluateFeatureFlagMock = vi.spyOn(graphqlClient, 'evaluateFeatureFlag')

            const provider = await newFeatureFlagProvider()
            await provider.refresh()

            // Wait for the async initialization
            await nextTick()

            expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
            expect(getEvaluatedFeatureFlagsMock).toHaveBeenCalled()
            expect(evaluateFeatureFlagMock).not.toHaveBeenCalled()

            getEvaluatedFeatureFlagsMock.mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })

            Date.now = () => 61 * 60 * 1000

            // We have a stale-while-revalidate cache so this will return the previous value while it
            // is reloading
            expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
            expect(getEvaluatedFeatureFlagsMock).toHaveBeenCalled()
            expect(evaluateFeatureFlagMock).not.toHaveBeenCalled()

            // Wait for the async reload
            await nextTick()

            expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(false)
        } finally {
            Date.now = originalNow
        }
    })

    describe('evaluatedFeatureFlag', () => {
        async function testEvaluatedFeatureFlag({
            expectInitialValues,
            updateMocks,
            expectFinalValues,
        }: {
            expectInitialValues: (boolean | undefined)[]
            updateMocks?: () => void
            expectFinalValues?: (boolean | undefined)[]
        }): Promise<void> {
            vitest.useFakeTimers()
            const provider = await newFeatureFlagProvider()

            const flag$ = provider.evaluatedFeatureFlag(FeatureFlag.TestFlagDoNotUse)

            const { values, done, unsubscribe } = readValuesFrom(flag$)
            vitest.runAllTimers()

            // Test the initial emissions.
            await nextTick()
            expect(values).toEqual<typeof values>(expectInitialValues)
            values.length = 0

            if (!updateMocks) {
                return
            }

            // Test that the observable emits updated values when flags change.
            updateMocks()
            provider.refresh()
            await nextTick()
            expect(values).toEqual<typeof values>(expectFinalValues!)
            values.length = 0

            // Ensure there are no emissions after unsubscribing.
            unsubscribe()
            await done
            expect(values).toEqual<typeof values>([])
        }

        it('should emit when a new flag is evaluated', async () => {
            vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue({})
            vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(false)
            await testEvaluatedFeatureFlag({ expectInitialValues: [false] })
        })

        it('should emit when value changes from true to false', async () => {
            vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: true,
            })
            vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(true)
            await testEvaluatedFeatureFlag({
                expectInitialValues: [true],
                updateMocks: () => {
                    vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue({
                        [FeatureFlag.TestFlagDoNotUse]: false,
                    })
                    vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(false)
                },
                expectFinalValues: [false],
            })
        })

        it('should emit when value changes from false to true', async () => {
            vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })
            vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(false)

            await testEvaluatedFeatureFlag({
                expectInitialValues: [false],
                updateMocks: () => {
                    vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue({
                        [FeatureFlag.TestFlagDoNotUse]: true,
                    })
                    vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(true)
                },
                expectFinalValues: [true],
            })
        })

        it('should emit undefined when a previously false flag is no longer in the exposed list', async () => {
            vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })
            vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(false)
            await testEvaluatedFeatureFlag({
                expectInitialValues: [false],
                updateMocks: () => {
                    vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue({})
                    vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(null)
                },
                expectFinalValues: [undefined],
            })
        })
    })
})
