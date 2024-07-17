import {
    type ContextItem,
    FeatureFlag,
    type FeatureFlagProvider,
    type SourcegraphGraphQLAPIClient,
    isError,
    logError,
} from '@sourcegraph/cody-shared'
import type { InputContextItem } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

function toInput(input: ContextItem[]): InputContextItem[] {
    return input
        .map(i => {
            if (!i || !i.content) {
                return null
            }
            return {
                content: i.content,
                retriever: i.source || '',
            }
        })
        .filter(i => i !== null)
}

export class ContextAPIClient {
    constructor(
        private readonly apiClient: SourcegraphGraphQLAPIClient,
        private readonly featureFlagProvider: FeatureFlagProvider
    ) {}

    public detectChatIntent(interactionID: string, query: string) {
        if (!this.featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyServerSideContextAPI)) {
            return
        }
        return this.apiClient.chatIntent(interactionID, query)
    }

    public async rankContext(interactionID: string, query: string, context: ContextItem[]) {
        if (!this.featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyServerSideContextAPI)) {
            return
        }
        const res = await this.apiClient.rankContext(interactionID, query, toInput(context))
        if (isError(res)) {
            logError('rankContext', 'ranking result', res)
            return res
        }
        return { used: res.rankContext.used, unused: res.rankContext.discarded }
    }

    public async recordContext(interactionID: string, used: ContextItem[], unused: ContextItem[]) {
        if (!this.featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyServerSideContextAPI)) {
            return
        }
        await this.apiClient.recordContext(interactionID, toInput(used), toInput(unused))
    }
}
