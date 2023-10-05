import { describe, expect, it, vitest } from 'vitest'

import { SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'

import { FeatureFlag, FeatureFlagProvider } from './FeatureFlagProvider'

describe('FeatureFlagProvider', () => {
    it('evaluates the feature flag on dotcom', async () => {
        const apiClient = {
            isDotCom: () => true,
            getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({}),
            evaluateFeatureFlag: vitest.fn().mockResolvedValue(true),
        } as unknown as SourcegraphGraphQLAPIClient

        const provider = new FeatureFlagProvider(apiClient)

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
    })

    it('does not make a network request when not on dotcom', async () => {
        const apiClient = {
            isDotCom: () => false,
            getEvaluatedFeatureFlags: vitest.fn(),
            evaluateFeatureFlag: vitest.fn(),
        }

        const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(false)
        expect(apiClient.getEvaluatedFeatureFlags).not.toHaveBeenCalled()
        expect(apiClient.evaluateFeatureFlag).not.toHaveBeenCalled()
    })

    it('loads all evaluated feature flag on `syncAuthStatus`', async () => {
        const apiClient = {
            isDotCom: () => true,
            getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                [FeatureFlag.TestFlagDoNotUse]: true,
            }),
            evaluateFeatureFlag: vitest.fn(),
        }

        const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)
        provider.syncAuthStatus()

        // Wait for the async initialization
        await nextTick()

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(true)
        expect(apiClient.getEvaluatedFeatureFlags).toHaveBeenCalled()
        expect(apiClient.evaluateFeatureFlag).not.toHaveBeenCalled()
    })

    it('should handle API errors', async () => {
        const apiClient = {
            isDotCom: () => true,
            getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue(new Error('API error')),
            evaluateFeatureFlag: vitest.fn().mockResolvedValue(new Error('API error')),
        }

        const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(false)
    })

    it('should refresh flags', async () => {
        const apiClient = {
            isDotCom: () => true,
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

        provider.syncAuthStatus()

        // Wait for the async reload
        await nextTick()

        expect(await provider.evaluateFeatureFlag(FeatureFlag.TestFlagDoNotUse)).toBe(false)
    })

    it('should refresh flags after one hour', async () => {
        const originalNow = Date.now
        try {
            Date.now = () => 0
            const apiClient = {
                isDotCom: () => true,
                getEvaluatedFeatureFlags: vitest.fn().mockResolvedValue({
                    [FeatureFlag.TestFlagDoNotUse]: true,
                }),
                evaluateFeatureFlag: vitest.fn(),
            }

            const provider = new FeatureFlagProvider(apiClient as unknown as SourcegraphGraphQLAPIClient)
            provider.syncAuthStatus()

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
})

async function nextTick() {
    return new Promise(resolve => setTimeout(resolve, 0))
}
