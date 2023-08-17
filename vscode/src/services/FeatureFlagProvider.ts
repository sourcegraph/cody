import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isError } from '@sourcegraph/cody-shared/src/utils'

export class FeatureFlagProvider {
    private featureFlags: Record<string, boolean> = {}

    constructor(private sourcegraphGraphQLAPIClient: SourcegraphGraphQLAPIClient) {}

    public async init(): Promise<void> {
        if (this.sourcegraphGraphQLAPIClient.isDotCom()) {
            const data = await this.sourcegraphGraphQLAPIClient.getEvaluatedFeatureFlags()
            if (!isError(data)) {
                this.featureFlags = data
            }
        }
    }

    public async evaluateFeatureFlag(flagName: string): Promise<boolean> {
        if (!this.sourcegraphGraphQLAPIClient.isDotCom()) {
            return false
        }

        const cachedValue = this.featureFlags[flagName]
        if (cachedValue !== undefined) {
            // NOTE: This will still return "old" value if flag value changes during the current session.
            return cachedValue
        }

        const value = await this.sourcegraphGraphQLAPIClient.evaluateFeatureFlag(flagName)
        if (value === null || isError(value)) {
            return false
        }

        this.featureFlags[flagName] = value
        return value
    }

    public syncAuthStatus(): void {
        void this.init()
    }
}

export async function createFeatureFlagProvider(
    sourcegraphGraphQLAPIClient: SourcegraphGraphQLAPIClient
): Promise<FeatureFlagProvider> {
    const provider = new FeatureFlagProvider(sourcegraphGraphQLAPIClient)
    await provider.init()
    return provider
}
