import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, vitest } from 'vitest'

import { graphqlClient } from '../sourcegraph-api/graphql'

import { mockAuthStatus } from '../auth/authStatus'
import { AUTH_STATUS_FIXTURE_AUTHED } from '../auth/types'
import { mockResolvedConfig } from '../configuration/resolver'
import { readValuesFrom } from '../misc/observable'
import { FeatureFlag, FeatureFlagProviderImpl } from './FeatureFlagProvider'

vi.mock('../sourcegraph-api/graphql/client')

describe('FeatureFlagProvider', () => {
    beforeAll(() => {
        vi.useFakeTimers()
        mockResolvedConfig({
            auth: { accessToken: null, serverEndpoint: 'https://example.com' },
        })
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
    })

    let featureFlagProvider: FeatureFlagProviderImpl
    beforeEach(() => {
        featureFlagProvider = new FeatureFlagProviderImpl()
    })

    let unsubscribeAfter: (() => void) | undefined = undefined
    afterEach(() => {
        vi.clearAllMocks()
        unsubscribeAfter?.()
        unsubscribeAfter = undefined
    })

    it('evaluates a single feature flag', async () => {
        const getEvaluatedFeatureFlagsMock = vi
            .spyOn(graphqlClient, 'getEvaluatedFeatureFlags')
            .mockResolvedValue({})
        const evaluateFeatureFlagMock = vi
            .spyOn(graphqlClient, 'evaluateFeatureFlag')
            .mockResolvedValue(true)

        expect(await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
        expect(getEvaluatedFeatureFlagsMock).toHaveBeenCalledTimes(0)
        expect(evaluateFeatureFlagMock).toHaveBeenCalledOnce()
    })

    it('reports exposed experiments', async () => {
        vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue({
            [FeatureFlag.TestFlagDoNotUse]: true,
        })
        vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(true)
        const { unsubscribe } = readValuesFrom(
            featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.TestFlagDoNotUse)
        )
        unsubscribeAfter = unsubscribe
        await vi.runOnlyPendingTimersAsync()
        expect(featureFlagProvider.getExposedExperiments('https://example.com')).toStrictEqual({
            [FeatureFlag.TestFlagDoNotUse]: true,
        })
        expect(featureFlagProvider.getExposedExperiments('https://other.example.com')).toStrictEqual({})
    })

    it('should handle API errors', async () => {
        vi.spyOn(graphqlClient, 'getEvaluatedFeatureFlags').mockResolvedValue(new Error('API error'))
        vi.spyOn(graphqlClient, 'evaluateFeatureFlag').mockResolvedValue(new Error('API error'))

        expect(await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(false)
    })

    describe('evaluatedFeatureFlag', () => {
        async function testEvaluatedFeatureFlag({
            expectInitialValues,
            updateMocks,
            expectFinalValues,
        }: {
            expectInitialValues: boolean[]
            updateMocks?: () => void
            expectFinalValues?: boolean[]
        }): Promise<void> {
            vitest.useFakeTimers()

            const { values, done, unsubscribe } = readValuesFrom(
                featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.TestFlagDoNotUse)
            )
            unsubscribeAfter = unsubscribe

            // Test the initial emissions.
            await vi.runOnlyPendingTimersAsync()
            expect(values).toEqual<typeof values>(expectInitialValues)
            values.length = 0

            if (!updateMocks) {
                return
            }

            // Test that the observable emits updated values when flags change.
            updateMocks()
            featureFlagProvider.refresh()
            await vi.runOnlyPendingTimersAsync()
            expect(values).toEqual<typeof values>(expectFinalValues!)
            values.length = 0

            // Ensure there are no emissions after unsubscribing.
            unsubscribe()
            await done
            expect(values).toEqual<typeof values>([])
        }

        it('should emit when a new flag is evaluated', { timeout: 500 }, async () => {
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

        it('should not emit false when a previously false flag is no longer in the exposed list', async () => {
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
                expectFinalValues: [],
            })
        })

        it('should refresh flags when the endpoint changes', async () => {
            const getEvaluatedFeatureFlagsMock = vi
                .spyOn(graphqlClient, 'getEvaluatedFeatureFlags')
                .mockResolvedValue({
                    [FeatureFlag.TestFlagDoNotUse]: true,
                })
            const evaluateFeatureFlagMock = vi
                .spyOn(graphqlClient, 'evaluateFeatureFlag')
                .mockResolvedValue(true)
            mockAuthStatus({ ...AUTH_STATUS_FIXTURE_AUTHED, endpoint: 'https://example.com' })

            expect(await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(
                true
            )

            getEvaluatedFeatureFlagsMock.mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })
            evaluateFeatureFlagMock.mockResolvedValue(false)
            mockAuthStatus({ ...AUTH_STATUS_FIXTURE_AUTHED, endpoint: 'https://other.example.com' })
            await vi.runOnlyPendingTimersAsync()
            expect(await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(
                false
            )
        })

        it('refresh()', async () => {
            vi.clearAllMocks()
            const getEvaluatedFeatureFlagsMock = vi
                .spyOn(graphqlClient, 'getEvaluatedFeatureFlags')
                .mockResolvedValue({
                    [FeatureFlag.TestFlagDoNotUse]: true,
                })
            const evaluateFeatureFlagMock = vi
                .spyOn(graphqlClient, 'evaluateFeatureFlag')
                .mockResolvedValue(true)

            const { values, unsubscribe } = readValuesFrom(
                featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.TestFlagDoNotUse)
            )
            unsubscribeAfter = unsubscribe

            await vi.runOnlyPendingTimersAsync()
            expect(values).toStrictEqual<typeof values>([true])
            values.length = 0
            expect(getEvaluatedFeatureFlagsMock).toHaveBeenCalledTimes(1)
            expect(evaluateFeatureFlagMock).toHaveBeenCalledTimes(1)

            getEvaluatedFeatureFlagsMock.mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })
            featureFlagProvider.refresh()
            await vi.runOnlyPendingTimersAsync()
            expect(values).toStrictEqual<typeof values>([false])
            expect(getEvaluatedFeatureFlagsMock).toHaveBeenCalledTimes(2)
            expect(evaluateFeatureFlagMock).toHaveBeenCalledTimes(1)
        })
    })
})
