import {
    type ContextItem,
    FeatureFlag,
    type InputContextItem,
    type SourcegraphGraphQLAPIClient,
    featureFlagProvider,
    isError,
    logError,
    storeLastValue,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

function toInput(input: ContextItem[]): InputContextItem[] {
    return input
        .map(i =>
            !i || !i.content
                ? null
                : {
                      content: i.content,
                      retriever: i.source || '',
                  }
        )
        .filter(notNull)
}

function notNull<T>(value: T | null | undefined): value is T {
    return value !== null && value !== undefined
}

export class ContextAPIClient {
    private featureCodyServerSideContextAPI = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyServerSideContextAPI)
    )
    private featureCodyIntentDetectionAPI = storeLastValue(
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyIntentDetectionAPI)
    )

    constructor(private readonly apiClient: SourcegraphGraphQLAPIClient) {}

    public dispose(): void {
        this.featureCodyServerSideContextAPI.subscription.unsubscribe()
        this.featureCodyIntentDetectionAPI.subscription.unsubscribe()
    }

    public async detectChatIntent(interactionID: string, query: string) {
        if (!this.isIntentDetectionAPIEnabled()) {
            return
        }
        return this.apiClient.chatIntent(interactionID, query)
    }

    public async rankContext(interactionID: string, query: string, context: ContextItem[]) {
        if (!this.isServerSideContextAPIEnabled()) {
            return
        }
        const res = await this.apiClient.rankContext(interactionID, query, toInput(context))
        if (isError(res)) {
            logError('rankContext', 'ranking result', res)
            return res
        }
        return { used: res.rankContext.used, ignored: res.rankContext.ignored }
    }

    public async recordContext(interactionID: string, used: ContextItem[], ignored: ContextItem[]) {
        if (!this.isServerSideContextAPIEnabled()) {
            return
        }
        await this.apiClient.recordContext(interactionID, toInput(used), toInput(ignored))
    }

    private isServerSideContextAPIEnabled(): boolean {
        if (vscode.workspace.getConfiguration().get<boolean>('cody.internal.serverSideContext')) {
            return true
        }
        return !!this.featureCodyServerSideContextAPI.value.last
    }

    private isIntentDetectionAPIEnabled(): boolean {
        if (vscode.workspace.getConfiguration().get<boolean>('cody.internal.intentDetectionAPI')) {
            return true
        }
        return !!this.featureCodyIntentDetectionAPI.value.last
    }
}
