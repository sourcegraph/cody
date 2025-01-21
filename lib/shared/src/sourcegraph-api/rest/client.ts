import type { ServerModelConfiguration } from '../../models/modelsService'

import { type AuthCredentials, addAuthHeaders } from '../..'
import { fetch } from '../../fetch'
import { logError } from '../../logger'
import { addTraceparent, wrapInActiveSpan } from '../../tracing'
import { addCodyClientIdentificationHeaders } from '../client-name-version'
import { isAbortError } from '../errors'
import { verifyResponseCode } from '../graphql/client'

/**
 * RestClient is a thin HTTP client that interacts with the Sourcegraph backend.
 *
 * Where possible, this client uses the same data for how things get hooked into
 * the GraphQL client. e.g. HTTP requests made by this client will honor the
 * `graphql` package's `setUserAgent` and `addCodyClientIdentificationHeaders` methods.
 *
 * NOTE: This is semi-experimental. @chrsmith is a fan of how easy REST APIs can
 * be versioned/evolve compared to GraphQL. But if there is much pushback, we'll
 * just expose the same endpoint using the backend's GraphQL API.
 */
export class RestClient {
    /**
     * Creates a new REST client to interact with a Sourcegraph instance.
     * @param auth Authentication credentials containing endpoint URL and access token
     * @param customHeaders Additional headers for requests (used by Cody Web to ensure proper auth flow)
     */
    constructor(
        private auth: AuthCredentials,
        private customHeaders: Record<string, string> | undefined
    ) {}

    // Make an authenticated HTTP request to the Sourcegraph instance.
    // "name" is a developer-friendly term to label the request's trace span.
    private async getRequest<T>(
        name: string,
        urlSuffix: string,
        signal?: AbortSignal
    ): Promise<T | Error> {
        const headers = new Headers(this.customHeaders)

        const endpoint = new URL(this.auth.serverEndpoint)
        endpoint.pathname = urlSuffix
        const url = endpoint.href

        addCodyClientIdentificationHeaders(headers)
        addTraceparent(headers)

        try {
            await addAuthHeaders(this.auth, headers, endpoint)
        } catch (error: any) {
            return error
        }

        return wrapInActiveSpan(`rest-api.${name}`, () =>
            fetch(url, {
                method: 'GET',
                headers,
                signal,
            })
                .then(verifyResponseCode)
                .then(response => response.json() as T)
                .catch(error =>
                    isAbortError(error)
                        ? error
                        : new Error(`error calling Sourcegraph REST API: ${error} (${url})`)
                )
        )
    }

    /**
     * getAvailableModels fetches the LLM models that the Sourcegraph instance supports.
     *
     * IMPORTANT: The list may include models that the current Cody client does not know
     * how to operate.
     */
    public async getAvailableModels(
        signal?: AbortSignal
    ): Promise<ServerModelConfiguration | undefined> {
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
            '/.api/modelconfig/supported-models.json',
            signal
        )
        if (serverSideConfig instanceof Error) {
            if (isAbortError(serverSideConfig)) {
                throw serverSideConfig
            }
            logError('RestClient::getAvailableModels', 'failed to fetch available models', {
                verbose: serverSideConfig,
            })
            return
        }

        return serverSideConfig
    }
}
