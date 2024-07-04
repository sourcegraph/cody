import { Model, type ServerModel } from '../../models/index'

import { fetch } from '../../fetch'
import { addTraceparent, wrapInActiveSpan } from '../../tracing'
import { addCustomUserAgent, verifyResponseCode } from '../graphql/client'

/**
 * RestClient is a thin HTTP client that interacts with the Sourcegraph backend.
 *
 * Where possible, this client uses the same data for how things get hooked into
 * the GraphQL client. e.g. HTTP requests made by this client will honor the
 * `graphql` package's `setUserAgent` and `addCustomUserAgent` methods.
 *
 * NOTE: This is semi-experimental. @chrsmith is a fan of how easy REST APIs can
 * be versioned/evolve compared to GraphQL. But if there is much pushback, we'll
 * just expose the same endpoint using the backend's GraphQL API.
 */
export class RestClient {
    /**
     * @param endpointUrl URL to the sourcegraph instance, e.g. "https://sourcegraph.acme.com".
     * @param accessToken User access token to contact the sourcegraph instance.
     */
    constructor(
        private endpointUrl: string,
        private accessToken: string
    ) {}

    // Make an authenticated HTTP request to the Sourcegraph instance.
    // "name" is a developer-friendly term to label the request's trace span.
    private getRequest<T>(name: string, urlSuffix: string): Promise<T | Error> {
        const headers = new Headers()
        headers.set('Authorization', `token ${this.accessToken}`)
        addCustomUserAgent(headers)
        addTraceparent(headers)

        const endpoint = new URL(this.endpointUrl)
        endpoint.pathname = urlSuffix
        const url = endpoint.href
        return wrapInActiveSpan(`rest-api.${name}`, () =>
            fetch(url, {
                method: 'GET',
                headers,
            })
                .then(verifyResponseCode)
                .then(response => response.json() as T)
                .catch(error => new Error(`error calling Sourcegraph REST API: ${error} (${url})`))
        )
    }

    /**
     * getAvailableModels fetches the LLM models that the Sourcegraph instance supports.
     *
     * IMPORTANT: The list may include models that the current Cody client does not know
     * how to operate.
     */
    public async getAvailableModels(): Promise<Model[]> {
        // Fetch the server-side configuration data. This will be in the form of a JSON blob
        // matching the schema defined in the `sourcegraph/llm-model' repo
        //
        // TODO(PRIME-322): Export the type information via NPM. For now, we just blindly
        // walk the returned object model.
        //
        // NOTE: This API endpoint hasn't shippeted yet, and probably won't work for you.
        // Also, the URL definitely will change.
        let serverSideConfig: any
        try {
            serverSideConfig = await this.getRequest<any>('getAvailableModels', '/.api/supported-llms')
        } catch {
            serverSideConfig = testModels
        }

        // TODO(PRIME-323): Do a proper review of the data model we will use to describe
        // server-side configuration. Once complete, it should match the data types we
        // use in this repo exactly. Until then, we need to map the "server-side" model
        // types, to the `Model` types used by Cody clients.
        return serverSideConfig.models.map(Model.fromApi)
    }
}

const testModels = {
    schemaVersion: '1.0',
    revision: '-',
    providers: [
        {
            id: 'anthropic',
            displayName: 'Provider "anthropic"',
        },
    ],
    models: [
        {
            modelRef: 'anthropic::unknown::anthropic.claude-3-opus-20240229-v1_0',
            displayName: 'anthropic.claude-3-opus-20240229-v1_0',
            modelName: 'anthropic.claude-3-opus-20240229-v1_0',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced',
            status: 'stable',
            tier: 'enterprise',
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::unknown::anthropic.claude-instant-v1',
            displayName: 'anthropic.claude-instant-v1',
            modelName: 'anthropic.claude-instant-v1',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced',
            status: 'stable',
            tier: 'enterprise',
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        },
        {
            modelRef: 'anthropic::unknown::amazon.titan-text-lite-v1',
            displayName: 'amazon.titan-text-lite-v1',
            modelName: 'amazon.titan-text-lite-v1',
            capabilities: ['autocomplete', 'chat'],
            category: 'balanced',
            status: 'stable',
            tier: 'enterprise',
            contextWindow: {
                maxInputTokens: 9000,
                maxOutputTokens: 4000,
            },
        },
    ] as ServerModel[],
    defaultModels: {
        chat: 'anthropic::unknown::amazon.titan-text-lite-v1',
        fastChat: 'anthropic::unknown::anthropic.claude-3-opus-20240229-v1_0',
        codeCompletion: 'anthropic::unknown::anthropic.claude-instant-v1',
    },
}
