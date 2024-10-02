import { fetchEventSource } from '@microsoft/fetch-event-source'

import { dependentAbortController } from '../../common/abortController'
import { currentResolvedConfig } from '../../configuration/resolver'
import { isError } from '../../utils'
import { addClientInfoParams } from '../client-name-version'
import { addCustomUserAgent } from '../graphql/client'
import { CompletionsResponseBuilder } from './CompletionsResponseBuilder'
import { type CompletionRequestParameters, SourcegraphCompletionsClient } from './client'
import { parseCompletionJSON } from './parse'
import type { CompletionCallbacks, CompletionParameters, CompletionResponse, Event } from './types'
import { getSerializedParams } from './utils'

declare const WorkerGlobalScope: never
const isRunningInWebWorker =
    typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope

export class SourcegraphBrowserCompletionsClient extends SourcegraphCompletionsClient {
    protected async _streamWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const { apiVersion } = requestParams
        const serializedParams = await getSerializedParams(params)

        const url = new URL(await this.completionsEndpoint())
        if (apiVersion >= 1) {
            url.searchParams.append('api-version', '' + apiVersion)
        }
        addClientInfoParams(url.searchParams)

        const config = await currentResolvedConfig()

        const abort = dependentAbortController(signal)
        const headersInstance = new Headers({
            ...config.configuration?.customHeaders,
            ...requestParams.customHeaders,
        } as HeadersInit)
        addCustomUserAgent(headersInstance)
        headersInstance.set('Content-Type', 'application/json; charset=utf-8')
        if (config.auth.accessToken) {
            headersInstance.set('Authorization', `token ${config.auth.accessToken}`)
        }
        const parameters = new URLSearchParams(globalThis.location.search)
        const trace = parameters.get('trace')
        if (trace) {
            headersInstance.set('X-Sourcegraph-Should-Trace', 'true')
        }
        const builder = new CompletionsResponseBuilder(apiVersion)
        // Disable gzip compression since the sg instance will start to batch
        // responses afterwards.
        headersInstance.set('Accept-Encoding', 'gzip;q=0')
        fetchEventSource(url.toString(), {
            method: 'POST',
            headers: Object.fromEntries(headersInstance.entries()),
            body: JSON.stringify(serializedParams),
            signal: abort.signal,
            openWhenHidden: isRunningInWebWorker, // otherwise tries to call document.addEventListener
            async onopen(response) {
                if (!response.ok && response.headers.get('content-type') !== 'text/event-stream') {
                    let errorMessage: null | string = null
                    try {
                        errorMessage = await response.text()
                    } catch (error) {
                        // We show the generic error message in this case
                        console.error(error)
                    }
                    const error = new Error(
                        errorMessage === null || errorMessage.length === 0
                            ? `Request failed with status code ${response.status}`
                            : errorMessage
                    )
                    cb.onError(error, response.status)
                    abort.abort()
                    return
                }
            },
            onmessage: message => {
                try {
                    const events: Event[] = []
                    if (message.event === 'completion') {
                        const data = parseCompletionJSON(message.data)
                        if (isError(data)) {
                            throw data
                        }
                        events.push({
                            type: 'completion',
                            // concatenate deltas when using api-version>=2
                            completion: builder.nextCompletion(data.completion, data.deltaText),
                            stopReason: data.stopReason,
                        })
                    } else {
                        events.push({ type: message.event, ...JSON.parse(message.data) })
                    }
                    this.sendEvents(events, cb)
                } catch (error: any) {
                    cb.onError(error.message)
                    abort.abort()
                    console.error(error)
                    // throw the error for not retrying
                    throw error
                }
            },
            onerror(error) {
                cb.onError(error.message)
                abort.abort()
                console.error(error)
                // throw the error for not retrying
                throw error
            },
            fetch: globalThis.fetch,
        }).catch(error => {
            cb.onError(error.message)
            abort.abort()
            console.error(error)
        })
    }

    protected async _fetchWithCallbacks(
        params: CompletionParameters,
        requestParams: CompletionRequestParameters,
        cb: CompletionCallbacks,
        signal?: AbortSignal
    ): Promise<void> {
        const { auth, configuration } = await currentResolvedConfig()
        const { url, serializedParams } = await this.prepareRequest(params, requestParams)
        const headersInstance = new Headers({
            'Content-Type': 'application/json; charset=utf-8',
            ...configuration.customHeaders,
            ...requestParams.customHeaders,
        })
        addCustomUserAgent(headersInstance)
        if (auth.accessToken) {
            headersInstance.set('Authorization', `token ${auth.accessToken}`)
        }
        if (new URLSearchParams(globalThis.location.search).get('trace')) {
            headersInstance.set('X-Sourcegraph-Should-Trace', 'true')
        }
        try {
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: headersInstance,
                body: JSON.stringify(serializedParams),
                signal,
            })
            if (!response.ok) {
                const errorMessage = await response.text()
                throw new Error(
                    errorMessage.length === 0
                        ? `Request failed with status code ${response.status}`
                        : errorMessage
                )
            }
            const data = (await response.json()) as CompletionResponse
            if (data?.completion) {
                cb.onChange(data.completion)
                cb.onComplete()
            } else {
                throw new Error('Unexpected response format')
            }
        } catch (error) {
            console.error(error)
            cb.onError(error instanceof Error ? error : new Error(`${error}`))
        }
    }
}

if (isRunningInWebWorker) {
    // NOTE: If we need to add more hacks, or if this is janky, we should consider just setting
    // `globalThis.window = globalThis` (see
    // https://github.com/sourcegraph/cody/pull/4047#discussion_r1593823318).

    ;(self as any).document = {
        // HACK: @microsoft/fetch-event-source tries to call document.removeEventListener, which is
        // not available in a worker.
        removeEventListener: () => {},

        // HACK: web-tree-sitter tries to read window.document.currentScript, which fails if this is
        // running in a Web Worker.
        currentScript: null,

        // HACK: Vite HMR client tries to call querySelectorAll, which is not
        // available in a web worker, without this cody demo fails in dev mode.
        querySelectorAll: () => [],
    }
    ;(self as any).window = {
        // HACK: @microsoft/fetch-event-source tries to call window.clearTimeout, which fails if this is
        // running in a Web Worker.
        clearTimeout: (...args: Parameters<typeof clearTimeout>) => clearTimeout(...args),

        document: self.document,
    }
    // HACK: @openctx/vscode-lib uses global object to share vscode API, it breaks cody web since
    // global doesn't exist in web worker context, for more details see openctx issue here
    // https://github.com/sourcegraph/openctx/issues/169
    ;(self as any).global = {}
}
