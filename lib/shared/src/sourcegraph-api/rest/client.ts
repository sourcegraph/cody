import type { ServerModelConfiguration } from '../../models/modelsService'

import { fetch } from '../../fetch'
import { logError } from '../../logger'
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
     * @param customHeaders Custom headers (primary is used by Cody Web case when Sourcegraph client
     * providers set of custom headers to make sure that auth flow will work properly
     */
    constructor(
        private endpointUrl: string,
        private accessToken: string | undefined,
        private customHeaders: Record<string, string> | undefined
    ) {}

    // Make an authenticated HTTP request to the Sourcegraph instance.
    // "name" is a developer-friendly term to label the request's trace span.
    private getRequest<T>(name: string, urlSuffix: string): Promise<T | Error> {
        const headers = new Headers(this.customHeaders)
        if (this.accessToken) {
            headers.set('Authorization', `token ${this.accessToken}`)
        }
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
    public async getAvailableModels(): Promise<ServerModelConfiguration | undefined> {
        // Fetch the server-side configuration data. This will be in the form of a JSON blob
        // matching the schema defined in the `sourcegraph/llm-model' repo
        //
        // TODO(PRIME-322): Export the type information via NPM. For now, we just blindly
        // walk the returned object model.
        //
        // NOTE: This API endpoint hasn't shipped yet, and probably won't work for you.
        // Also, the URL definitely will change.
        const serverSideConfig = await this.getRequest<ServerModelConfiguration>(
            'getAvailableModels',
            '/.api/modelconfig/supported-models.json'
        )
        if (serverSideConfig instanceof Error) {
            logError('RestClient::getAvailableModels', 'failed to fetch available models', {
                verbose: serverSideConfig,
            })
            return
        }

        return serverSideConfig
    }
}
