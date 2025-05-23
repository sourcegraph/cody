import { fetchEventSource } from '@microsoft/fetch-event-source'

import { dependentAbortController, onAbort } from '../../common/abortController'
import { currentResolvedConfig } from '../../configuration/resolver'
import { isError } from '../../utils'
import { addClientInfoParams, addCodyClientIdentificationHeaders } from '../client-name-version'
import { addAuthHeaders } from '../utils'

import { verifyResponseCode } from '../graphql/client'
import { CompletionsResponseBuilder } from './CompletionsResponseBuilder'
import { type CompletionRequestParameters, SourcegraphCompletionsClient } from './client'
import { parseCompletionJSON } from './parse'
import type { CompletionCallbacks, CompletionParameters, CompletionResponse, Event } from './types'
import { getSerializedParams } from './utils'

import type { CompletionContentData } from './types'

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
        addCodyClientIdentificationHeaders(headersInstance)
        headersInstance.set('Content-Type', 'application/json; charset=utf-8')

        try {
            await addAuthHeaders(config.auth, headersInstance, url)
        } catch (error: any) {
            cb.onError(error.message)
            abort.abort()
            console.error(error)
            return
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
                    const error = await verifyResponseCode(response).catch(err => err)
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

                        builder.nextThinking(data.delta_thinking)
                        const completion = builder.nextCompletion(data.completion, data.deltaText)
                        const toolCalls = builder.nextToolCalls(data?.delta_tool_calls)
                        const content: CompletionContentData[] = []
                        if (completion) {
                            content.push({ type: 'text', text: completion })
                        }
                        content.push(...toolCalls)
                        events.push({
                            type: 'completion',
                            // concatenate deltas when using api-version>=2
                            completion: completion,
                            stopReason: data.stopReason,
                            content: content,
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

        // 'fetchEventSource' does not emit any event/message when the signal gets abborted. Instead,
        // the returned promise gets resolved. However we cannot really differentiate between the
        // promising resolving because the signal got aborted and the stream ended.
        // That's why we subscribe to the signal directly and trigger the completion callback.
        onAbort(signal, cb.onComplete)
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
            Accept: 'text/event-stream',
            ...configuration.customHeaders,
            ...requestParams.customHeaders,
        })
        addCodyClientIdentificationHeaders(headersInstance)

        if (new URLSearchParams(globalThis.location.search).get('trace')) {
            headersInstance.set('X-Sourcegraph-Should-Trace', 'true')
        }
        try {
            await addAuthHeaders(auth, headersInstance, url)

            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: headersInstance,
                body: JSON.stringify(serializedParams),
                signal,
            }).then(verifyResponseCode)
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
