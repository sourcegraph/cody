import * as vscode from 'vscode'

import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'
import { isError } from '@sourcegraph/cody-shared/src/utils'

export class FeatureFlagProvider {
    private featureFlags: Record<string, boolean> = {}

    protected disposables: vscode.Disposable[] = []

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
        const cachedValue = this.featureFlags[flagName]
        if (cachedValue) {
            // Won't work if flag value changes during the current session
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
