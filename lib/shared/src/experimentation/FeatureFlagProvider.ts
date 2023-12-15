/* eslint-disable no-void */
import { graphqlClient, SourcegraphGraphQLAPIClient } from '../sourcegraph-api/graphql'
import { isError } from '../utils'

export enum FeatureFlag {
    // This flag is only used for testing the behavior of the provider and should not be used in
    // product code
    TestFlagDoNotUse = 'test-flag-do-not-use',

    CodyAutocompleteTracing = 'cody-autocomplete-tracing',
    CodyAutocompleteStarCoder7B = 'cody-autocomplete-default-starcoder-7b',
    CodyAutocompleteStarCoder16B = 'cody-autocomplete-default-starcoder-16b',
    CodyAutocompleteStarCoderHybrid = 'cody-autocomplete-default-starcoder-hybrid',
    CodyAutocompleteLlamaCode7B = 'cody-autocomplete-default-llama-code-7b',
    CodyAutocompleteLlamaCode13B = 'cody-autocomplete-default-llama-code-13b',
    CodyAutocompleteContextLspLight = 'cody-autocomplete-context-lsp-light',
    CodyAutocompleteContextBfg = 'cody-autocomplete-context-bfg',
    CodyAutocompleteContextBfgMixed = 'cody-autocomplete-context-bfg-mixed',
    CodyAutocompleteContextLocalMixed = 'cody-autocomplete-context-local-mixed',
    CodyAutocompleteStarCoderExtendedTokenWindow = 'cody-autocomplete-starcoder-extended-token-window',
    CodyAutocompleteUserLatency = 'cody-autocomplete-user-latency',
    CodyAutocompleteDisableRecyclingOfPreviousRequests = 'cody-autocomplete-disable-recycling-of-previous-requests',
    CodyAutocompleteDynamicMultilineCompletions = 'cody-autocomplete-dynamic-multiline-completions',
    CodyAutocompleteHotStreak = 'cody-autocomplete-hot-streak',

    CodyPro = 'cody-pro',
    CodyProJetBrains = 'cody-pro-jetbrains',
    CodyChatMockTest = 'cody-chat-mock-test',
}

const ONE_HOUR = 60 * 60 * 1000

export class FeatureFlagProvider {
    // The first key maps to the endpoint so that we do never cache the wrong flag for different
    // endpoints
    private featureFlags: Record<string, Record<string, boolean>> = {}
    private lastUpdated = 0

    constructor(private apiClient: SourcegraphGraphQLAPIClient) {}

    private getFromCache(flagName: FeatureFlag, endpoint: string): boolean | undefined {
        const now = Date.now()
        if (now - this.lastUpdated > ONE_HOUR) {
            // Cache expired, refresh
            void this.refreshFeatureFlags()
        }

        return this.featureFlags[endpoint]?.[flagName]
    }

    public async evaluateFeatureFlag(flagName: FeatureFlag): Promise<boolean> {
        const endpoint = this.apiClient.endpoint
        if (process.env.BENCHMARK_DISABLE_FEATURE_FLAGS) {
            return false
        }

        const cachedValue = this.getFromCache(flagName, endpoint)
        if (cachedValue !== undefined) {
            return cachedValue
        }

        const value = await this.apiClient.evaluateFeatureFlag(flagName)
        if (!this.featureFlags[endpoint]) {
            this.featureFlags[endpoint] = {}
        }
        this.featureFlags[endpoint][flagName] = value === null || isError(value) ? false : value
        return this.featureFlags[endpoint][flagName]
    }

    public syncAuthStatus(): void {
        this.featureFlags = {}
        void this.refreshFeatureFlags()
    }

    private async refreshFeatureFlags(): Promise<void> {
        const endpoint = this.apiClient.endpoint
        const data = await this.apiClient.getEvaluatedFeatureFlags()
        this.featureFlags[endpoint] = isError(data) ? {} : data
        this.lastUpdated = Date.now()
    }
}

export const featureFlagProvider = new FeatureFlagProvider(graphqlClient)
