import {
    type TaskContext,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    vitest,
} from 'vitest'

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
            auth: { credentials: undefined, serverEndpoint: 'https://example.com' },
        })
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)
    })

    let featureFlagProvider: FeatureFlagProviderImpl
    beforeEach(() => {
        featureFlagProvider = new FeatureFlagProviderImpl()
    })
    afterEach(() => {
        vi.clearAllMocks()
        featureFlagProvider.dispose()
    })

    it('evaluates a single feature flag', async task => {
        const evaluateFeatureFlagsMock = vi
            .spyOn(graphqlClient, 'evaluateFeatureFlags')
            .mockResolvedValue({ [FeatureFlag.TestFlagDoNotUse]: true })

        const { values, unsubscribe } = readValuesFrom(
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)
        )
        task.onTestFinished(() => unsubscribe())

        await vi.runOnlyPendingTimersAsync()

        expect(values).toContain(true)
        expect(evaluateFeatureFlagsMock).toHaveBeenCalledTimes(1)
    })

    it('reports exposed experiments', async task => {
        vi.spyOn(graphqlClient, 'evaluateFeatureFlags').mockResolvedValue({
            [FeatureFlag.TestFlagDoNotUse]: true,
        })
        const { unsubscribe } = readValuesFrom(
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)
        )
        task.onTestFinished(() => unsubscribe())
        await vi.runOnlyPendingTimersAsync()
        expect(featureFlagProvider.getExposedExperiments('https://example.com')).toStrictEqual({
            [FeatureFlag.TestFlagDoNotUse]: true,
        })
        expect(featureFlagProvider.getExposedExperiments('https://other.example.com')).toStrictEqual({})
    })

    it('should handle API errors', async task => {
        vi.spyOn(graphqlClient, 'evaluateFeatureFlags').mockResolvedValue(new Error('API error'))

        const { values, unsubscribe } = readValuesFrom(
            featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)
        )
        task.onTestFinished(() => unsubscribe())

        await vi.runOnlyPendingTimersAsync()

        expect(values).toContain(false)
    })

    describe('evaluateFeatureFlag', () => {
        async function testEvaluateFeatureFlag({
            expectInitialValues,
            updateMocks,
            expectFinalValues,
            task,
        }: {
            expectInitialValues: boolean[]
            updateMocks?: () => void
            expectFinalValues?: boolean[]
            task: TaskContext
        }): Promise<void> {
            vitest.useFakeTimers()

            const { values, clearValues, done, unsubscribe } = readValuesFrom(
                featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)
            )
            task.onTestFinished(() => unsubscribe())

            // Test the initial emissions.
            await vi.runOnlyPendingTimersAsync()
            expect(values).toEqual<typeof values>(expectInitialValues)
            clearValues()

            if (!updateMocks) {
                return
            }

            // Test that the observable emits updated values when flags change.
            updateMocks()
            featureFlagProvider.refresh()
            await vi.runOnlyPendingTimersAsync()
            expect(values).toEqual<typeof values>(expectFinalValues!)
            clearValues()

            // Ensure there are no emissions after unsubscribing.
            unsubscribe()
            await done
            expect(values).toEqual<typeof values>([])
        }

        it('should emit when a new flag is evaluated', { timeout: 500 }, async task => {
            vi.spyOn(graphqlClient, 'evaluateFeatureFlags').mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })
            await testEvaluateFeatureFlag({ expectInitialValues: [false], task })
        })

        it('should emit when value changes from true to false', async task => {
            vi.spyOn(graphqlClient, 'evaluateFeatureFlags').mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: true,
            })
            await testEvaluateFeatureFlag({
                expectInitialValues: [true],
                updateMocks: () => {
                    vi.spyOn(graphqlClient, 'evaluateFeatureFlags').mockResolvedValue({
                        [FeatureFlag.TestFlagDoNotUse]: false,
                    })
                },
                expectFinalValues: [false],
                task,
            })
        })

        it('should emit when value changes from false to true', async task => {
            vi.spyOn(graphqlClient, 'evaluateFeatureFlags').mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })
            await testEvaluateFeatureFlag({
                expectInitialValues: [false],
                updateMocks: () => {
                    vi.spyOn(graphqlClient, 'evaluateFeatureFlags').mockResolvedValue({
                        [FeatureFlag.TestFlagDoNotUse]: true,
                    })
                },
                expectFinalValues: [true],
                task,
            })
        })

        it('should refresh flags when the endpoint changes', async task => {
            const evaluateFeatureFlagMock = vi
                .spyOn(graphqlClient, 'evaluateFeatureFlags')
                .mockResolvedValue({ [FeatureFlag.TestFlagDoNotUse]: true })
            mockAuthStatus({ ...AUTH_STATUS_FIXTURE_AUTHED, endpoint: 'https://example.com' })

            const { values: v1, unsubscribe: u1 } = readValuesFrom(
                featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)
            )
            task.onTestFinished(() => u1())

            await vi.runOnlyPendingTimersAsync()
            expect(v1).toStrictEqual([true])

            evaluateFeatureFlagMock.mockResolvedValue({ [FeatureFlag.TestFlagDoNotUse]: false })
            mockAuthStatus({ ...AUTH_STATUS_FIXTURE_AUTHED, endpoint: 'https://other.example.com' })
            await vi.runOnlyPendingTimersAsync()

            const { values: v2, unsubscribe: u2 } = readValuesFrom(
                featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)
            )
            task.onTestFinished(() => u2())

            await vi.runOnlyPendingTimersAsync()
            expect(v2).toStrictEqual([false])
        })

        it(
            'refresh()',
            async task => {
                vi.clearAllMocks()
                const evaluateFeatureFlagMock = vi
                    .spyOn(graphqlClient, 'evaluateFeatureFlags')
                    .mockResolvedValue({ [FeatureFlag.TestFlagDoNotUse]: true })

                const { values, clearValues, unsubscribe } = readValuesFrom(
                    featureFlagProvider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)
                )
                task.onTestFinished(() => unsubscribe())

                await vi.runOnlyPendingTimersAsync()
                expect(values).toStrictEqual<typeof values>([true])
                clearValues()
                expect(evaluateFeatureFlagMock).toHaveBeenCalledTimes(1)
                evaluateFeatureFlagMock.mockResolvedValue({ [FeatureFlag.TestFlagDoNotUse]: false })

                featureFlagProvider.refresh()
                await vi.runOnlyPendingTimersAsync()
                expect(values).toStrictEqual<typeof values>([false])
                expect(evaluateFeatureFlagMock).toHaveBeenCalledTimes(2)
            },
            { timeout: 2_000 }
        )
    })
})
