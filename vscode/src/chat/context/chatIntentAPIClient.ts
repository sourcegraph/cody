import type { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared'

export class ChatIntentAPIClient {
    constructor(private readonly apiClient: SourcegraphGraphQLAPIClient) {}

    public async detectChatIntent(interactionID: string, query: string) {
        return this.apiClient.chatIntent(interactionID, query)
    }
}
