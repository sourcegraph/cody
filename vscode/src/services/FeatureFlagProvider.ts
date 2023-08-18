import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isError } from '@sourcegraph/cody-shared/src/utils'

export enum FeatureFlag {
    CodyAutocompleteIncreasedDebounceTimeEnabled = 'cody-autocomplete-increased-debounce-time-enabled',
}

const ONE_HOUR = 60 * 60 * 1000

export class FeatureFlagProvider {
    private featureFlags: Record<string, boolean> = {}
    private lastUpdated = 0

    constructor(private sourcegraphGraphQLAPIClient: SourcegraphGraphQLAPIClient) {
        void this.refreshFeatureFlags()
    }

    public async refreshFeatureFlags(): Promise<void> {
        if (this.sourcegraphGraphQLAPIClient.isDotCom()) {
            const data = await this.sourcegraphGraphQLAPIClient.getEvaluatedFeatureFlags()
            this.featureFlags = isError(data) ? {} : data
        } else {
            this.featureFlags = {}
        }
        this.lastUpdated = Date.now()
    }

    private getFromCache(flagName: FeatureFlag): boolean | undefined {
        const now = Date.now()
        if (now - this.lastUpdated > ONE_HOUR) {
            // Cache expired, refresh
            void this.refreshFeatureFlags()
        }

        return this.featureFlags[flagName]
    }

    public async evaluateFeatureFlag(flagName: FeatureFlag): Promise<boolean> {
        if (!this.sourcegraphGraphQLAPIClient.isDotCom()) {
            return false
        }

        const cachedValue = this.getFromCache(flagName)
        if (cachedValue !== undefined) {
            return cachedValue
        }

        const value = await this.sourcegraphGraphQLAPIClient.evaluateFeatureFlag(flagName)
        this.featureFlags[flagName] = value === null || isError(value) ? false : value
        return this.featureFlags[flagName]
    }

    public syncAuthStatus(): void {
        void this.refreshFeatureFlags()
    }
}
