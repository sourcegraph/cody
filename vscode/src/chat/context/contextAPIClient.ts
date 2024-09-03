import {
    type ChatIntentResult,
    type ContextItem,
    FeatureFlag,
    type InputContextItem,
    type SourcegraphGraphQLAPIClient,
    featureFlagProvider,
    isError,
    logError,
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
    constructor(private readonly apiClient: SourcegraphGraphQLAPIClient) {}

    public async detectChatIntent(
        interactionID: string,
        query: string
    ): Promise<ChatIntentResult | Error | undefined> {
        if (!(await this.isServerSideContextAPIEnabled())) {
            return
        }
        return this.apiClient.chatIntent(interactionID, query)
    }

    public async rankContext(interactionID: string, query: string, context: ContextItem[]) {
        if (!(await this.isServerSideContextAPIEnabled())) {
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
        if (!(await this.isServerSideContextAPIEnabled())) {
            return
        }
        await this.apiClient.recordContext(interactionID, toInput(used), toInput(ignored))
    }

    private async isServerSideContextAPIEnabled(): Promise<boolean> {
        if (vscode.workspace.getConfiguration().get<boolean>('cody.internal.serverSideContext')) {
            return true
        }
        return await featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyServerSideContextAPI
        )
    }
}
