import { describe, expect, it, vitest } from 'vitest'

import type { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

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
        await provider.syncAuthStatus()

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

        await provider.syncAuthStatus()

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
            await provider.syncAuthStatus()

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

    describe('onFeatureFlagChanged', () => {
        it('should call the callback when a feature flag changes from true to false', async () => {
            vitest.useFakeTimers()
            const apiClient = {
                getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                    [FeatureFlag.TestFlagDoNotUse]: true,
                }),
                evaluateFeatureFlag: vitest.fn().mockResolvedValue(true),
            }
            const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)

            // Evaluate a flag so we know that this one is being tracked
            await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)

            const callback = vitest.fn()
            provider.onFeatureFlagChanged('test', callback)

            apiClient.getEvaluatedFeatureFlags.mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })
            vitest.runAllTimers()
            // The feature flags are being refreshed asynchronous, so we need to wait for the next
            // micro queue flush.
            vitest.useRealTimers()
            await nextTick()

            expect(callback).toHaveBeenCalled()
        })

        it('should call the callback when a feature flag changes from false to true', async () => {
            vitest.useFakeTimers()
            const apiClient = {
                getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                    [FeatureFlag.TestFlagDoNotUse]: false,
                }),
                evaluateFeatureFlag: vitest.fn().mockResolvedValue(false),
            }
            const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)

            // Evaluate a flag so we know that this one is being tracked
            await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)

            const callback = vitest.fn()
            provider.onFeatureFlagChanged('test', callback)

            apiClient.getEvaluatedFeatureFlags.mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: true,
            })
            vitest.runAllTimers()
            // The feature flags are being refreshed asynchronous, so we need to wait for the next
            // micro queue flush.
            vitest.useRealTimers()
            await nextTick()

            expect(callback).toHaveBeenCalled()
        })

        it('should not call the callback when a new flag is evaluated', async () => {
            vitest.useFakeTimers()
            const apiClient = {
                getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({}),
                evaluateFeatureFlag: vitest.fn().mockResolvedValue(true),
            }
            const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)

            const callback = vitest.fn()
            provider.onFeatureFlagChanged('test', callback)

            // Evaluate a flag so we know that this one is being tracked
            await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)

            vitest.runAllTimers()
            // The feature flags are being refreshed asynchronous, so we need to wait for the next
            // micro queue flush.
            vitest.useRealTimers()
            await nextTick()

            expect(callback).not.toHaveBeenCalled()
        })

        it('should not call the callback when a new flag is evaluated', async () => {
            vitest.useFakeTimers()
            const apiClient = {
                getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                    [FeatureFlag.TestFlagDoNotUse]: true,
                }),
                evaluateFeatureFlag: vitest.fn().mockResolvedValue(true),
            }
            const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)

            // Evaluate a flag so we know that this one is being tracked
            await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)

            const callback = vitest.fn()
            const unsubscribe = provider.onFeatureFlagChanged('test', callback)
            unsubscribe()

            apiClient.getEvaluatedFeatureFlags.mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: false,
            })
            vitest.runAllTimers()
            // The feature flags are being refreshed asynchronous, so we need to wait for the next
            // micro queue flush.
            vitest.useRealTimers()
            await nextTick()

            expect(callback).not.toHaveBeenCalled()
        })

        it('should not call the callback if a previously false feature flag is no longer set in the new evaluatedFeatureFlag list. This flag is likely not defined upstream', async () => {
            vitest.useFakeTimers()
            const apiClient = {
                getEvaluatedFeatureFlags: () => Promise.resolve({}),
                evaluateFeatureFlag: vitest.fn().mockResolvedValue(null),
            }
            const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)

            // Evaluate a flag so we know that this one is being tracked
            await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)

            const callback = vitest.fn()
            provider.onFeatureFlagChanged('test', callback)

            vitest.runAllTimers()
            // The feature flags are being refreshed asynchronous, so we need to wait for the next
            // micro queue flush.
            vitest.useRealTimers()
            await nextTick()

            expect(callback).not.toHaveBeenCalled()
        })
    })
})

async function nextTick() {
    return new Promise(resolve => setTimeout(resolve, 0))
}
