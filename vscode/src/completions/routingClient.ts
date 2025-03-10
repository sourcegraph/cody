import {
    type CompletionCallbacks,
    type CompletionGeneratorValue,
    type CompletionLogger,
    type CompletionParameters,
    type CompletionRequestParameters,
    DOTCOM_URL,
    SourcegraphCompletionsClient,
    currentResolvedConfig,
} from '@sourcegraph/cody-shared'

import type { AnthropicCompletionsClient } from './anthropicClient'
import type { SourcegraphNodeCompletionsClient } from './nodeClient'
interface RoutingClientOptions {
    sourcegraphClient: SourcegraphNodeCompletionsClient
    anthropicClient: AnthropicCompletionsClient
    logger?: CompletionLogger
}

/**
 * A client that routes completion requests to either the Sourcegraph API or Anthropic API
 * based on the current configuration, specifically whether the serverEndpoint is "sourcegraph.com".
 */
export class RoutingCompletionsClient extends SourcegraphCompletionsClient {
    private sourcegraphClient: SourcegraphNodeCompletionsClient
    private anthropicClient: AnthropicCompletionsClient

    constructor(options: RoutingClientOptions) {
        super(options.logger)
        this.sourcegraphClient = options.sourcegraphClient
        this.anthropicClient = options.anthropicClient
    }

    /**
     * Determines which client to use based on the current configuration.
     * Returns the Anthropic client if serverEndpoint is "sourcegraph.com", otherwise
     * returns the Sourcegraph client.
     */
    private async getActiveClient(): Promise<SourcegraphCompletionsClient> {
        const config = await currentResolvedConfig()
        const serverEndpoint = config.auth.serverEndpoint

        // Use Anthropic client for sourcegraph.com
        if (serverEndpoint === DOTCOM_URL.toString()) {
            return this.anthropicClient
        }

        // Use Sourcegraph client for all other endpoints
        return this.sourcegraphClient
    }

    public async *stream(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        signal?: AbortSignal
    ): AsyncGenerator<CompletionGeneratorValue> {
        const activeClient = await this.getActiveClient()
        return yield* activeClient.stream(params, requestParams, signal)
    }

    protected async _streamWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        // This is empty, as `stream` just delegates to the the real client
    }

    protected async _fetchWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        // This is empty, as `stream` just delegates to the the real client
    }
}
