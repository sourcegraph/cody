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

    public evaluateFeatureFlag(featureName: string): boolean {
        return this.featureFlags[featureName] ?? false
    }

    public syncAuthStatus(): void {
        void this.init()
    }
}
