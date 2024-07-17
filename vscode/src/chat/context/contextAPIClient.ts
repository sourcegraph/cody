import {
    type ContextItem,
    FeatureFlag,
    type FeatureFlagProvider,
    type SourcegraphGraphQLAPIClient,
    isError,
    logError,
} from '@sourcegraph/cody-shared'
import type { InputContextItem } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'

const toInput = (i: ContextItem | null): InputContextItem | null => {
    if (!i || !i.content) {
        return null
    }
    return {
        content: i.content,
        retriever: i.source || '',
    }
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
        const res = await this.apiClient.rankContext(
            interactionID,
            query,
            context
                .map(toInput)
                .filter(i => i != null)
                .map(i => i as InputContextItem)
        )
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
        await this.apiClient.recordContext(
            interactionID,
            used
                .map(toInput)
                .filter(i => i != null)
                .map(i => i as InputContextItem),
            unused
                .map(toInput)
                .filter(i => i != null)
                .map(i => i as InputContextItem)
        )
    }
}
