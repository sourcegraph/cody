import { Model } from '../../models/index'

import { fetch } from '../../fetch'

import { type ModelContextWindow, ModelUsage } from '../../models/types'
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
    ) {
        // Enforce that the endpointUrl doesn't end in a trailing slash.
        if (endpointUrl.endsWith('/')) {
            this.endpointUrl = endpointUrl.substring(0, endpointUrl.length - 1)
        }
    }

    // Make an authenticated HTTP request to the Sourcegraph instance.
    // "name" is a developer-friendly term to label the request's trace span.
    private getRequest<T>(name: string, urlSuffix: string): Promise<T | Error> {
        const headers = new Headers()
        headers.set('Authorization', `token ${this.accessToken}`)
        addCustomUserAgent(headers)
        addTraceparent(headers)

        const url = this.endpointUrl + urlSuffix
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
        const serverSideConfig = await this.getRequest<any>('getAvailableModels', '/.api/supported-llms')

        // TODO(PRIME-323): Do a proper review of the data model we will use to describe
        // server-side configuration. Once complete, it should match the data types we
        // use in this repo exactly. Until then, we need to map the "server-side" model
        // types, to the `Model` types used by Cody clients.
        const availableModels: Model[] = []
        const serverModels = serverSideConfig.models as any[]
        for (const serverModel of serverModels) {
            const serverContextWindow = serverModel.contextWindow
            const convertedContextWindow: ModelContextWindow = {
                input: serverContextWindow.maxInputTokens,
                output: serverContextWindow.maxOutputTokens,
                context: undefined, // Not yet captured in in the schema.
            }

            const convertedModel = new Model(
                // The Model type expects the `model` field to contain both the provider
                // and model name, whereas the server-side schema has a more nuanced view.
                // See PRIME-282.
                `${serverModel.provider}/${serverModel.model}`,
                [ModelUsage.Chat, ModelUsage.Edit],
                convertedContextWindow,
                // client-side config not captured in the schema yet.
                undefined
            )
            availableModels.push(convertedModel)
        }

        return availableModels
    }
}
