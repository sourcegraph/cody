import { SHA256, enc } from 'crypto-js'
import * as vscode from 'vscode'

import {
    type AutocompleteTimeouts,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type CompletionResponse,
    type CompletionResponseGenerator,
    CompletionStopReason,
    type ConfigurationWithAccessToken,
    NetworkError,
    TracedError,
    addTraceparent,
    displayPath,
    getActiveTraceAndSpanId,
    isAbortError,
    isNodeResponse,
    isRateLimitError,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import { fetch } from '../../fetch'
import { getLanguageConfig } from '../../tree-sitter/language'
import { getSuffixAfterFirstNewline } from '../text-processing'
import type { ContextSnippet } from '../types'
import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import { SpanStatusCode } from '@opentelemetry/api'
import { recordErrorToSpan, tracer } from '@sourcegraph/cody-shared/src/tracing'
import type { AuthStatus } from '../../chat/protocol'
import { logDebug } from '../../log'
import { createRateLimitErrorFromResponse, createSSEIterator, logResponseHeadersToSpan } from '../client'
import type { FetchCompletionResult } from './fetch-and-process-completions'
import {
    getCompletionParamsAndFetchImpl,
    getLineNumberDependentCompletionParams,
} from './get-completion-params'
import {
    type CompletionProviderTracer,
    Provider,
    type ProviderConfig,
    type ProviderOptions,
    standardContextSizeHints,
} from './provider'

export interface FireworksOptions {
    model: FireworksModel
    maxContextTokens?: number
    client: CodeCompletionsClient
    timeouts: AutocompleteTimeouts
    config: Pick<ConfigurationWithAccessToken, 'accessToken'>
    authStatus: Pick<AuthStatus, 'userCanUpgrade' | 'isDotCom' | 'endpoint'>
}

const PROVIDER_IDENTIFIER = 'fireworks'

const EOT_STARCODER = '<|endoftext|>'
const EOT_LLAMA_CODE = ' <EOT>'

// Model identifiers can be found in https://docs.fireworks.ai/explore/ and in our internal
// conversations
const MODEL_MAP = {
    // Virtual model strings. Cody Gateway will map to an actual model
    starcoder: 'fireworks/starcoder',
    'starcoder-16b': 'fireworks/starcoder-16b',
    'starcoder-7b': 'fireworks/starcoder-7b',

    // Fireworks model identifiers
    'llama-code-13b': 'fireworks/accounts/fireworks/models/llama-v2-13b-code',
}

type FireworksModel =
    | keyof typeof MODEL_MAP
    // `starcoder-hybrid` uses the 16b model for multiline requests and the 7b model for single line
    | 'starcoder-hybrid'

function getMaxContextTokens(model: FireworksModel): number {
    switch (model) {
        case 'starcoder':
        case 'starcoder-hybrid':
        case 'starcoder-16b':
        case 'starcoder-7b': {
            // StarCoder supports up to 8k tokens, we limit it to ~2k for evaluation against
            // other providers.
            return 2048
        }
        case 'llama-code-13b':
            // Llama 2 on Fireworks supports up to 4k tokens. We're constraining it here to better
            // compare the results
            return 2048
        default:
            return 1200
    }
}

const MAX_RESPONSE_TOKENS = 256

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: ['\n'],
    multilineStopSequences: ['\n\n', '\n\r\n'],
})

class FireworksProvider extends Provider {
    private model: FireworksModel
    private promptChars: number
    private client: CodeCompletionsClient
    private timeouts?: AutocompleteTimeouts
    private fastPathAccessToken?: string
    private authStatus: Pick<AuthStatus, 'userCanUpgrade' | 'isDotCom' | 'endpoint'>

    constructor(
        options: ProviderOptions,
        { model, maxContextTokens, client, timeouts, config, authStatus }: Required<FireworksOptions>
    ) {
        super(options)
        this.timeouts = timeouts
        this.model = model
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.client = client
        this.authStatus = authStatus

        const isNode = typeof process !== 'undefined'
        this.fastPathAccessToken =
            config.accessToken &&
            // Require the upstream to be dotcom
            this.authStatus.isDotCom &&
            // The fast path client only supports Node.js style response streams
            isNode
                ? dotcomTokenToGatewayToken(config.accessToken)
                : undefined
    }

    private createPrompt(snippets: ContextSnippet[]): string {
        const { prefix, suffix } = this.options.docContext

        const intro: string[] = []
        let prompt = ''

        const languageConfig = getLanguageConfig(this.options.document.languageId)

        // In StarCoder we have a special token to announce the path of the file
        if (!isStarCoderFamily(this.model)) {
            intro.push(`Path: ${this.options.document.fileName}`)
        }

        for (let snippetsToInclude = 0; snippetsToInclude < snippets.length + 1; snippetsToInclude++) {
            if (snippetsToInclude > 0) {
                const snippet = snippets[snippetsToInclude - 1]
                if ('symbol' in snippet && snippet.symbol !== '') {
                    intro.push(
                        `Additional documentation for \`${snippet.symbol}\`:\n\n${snippet.content}`
                    )
                } else {
                    intro.push(
                        `Here is a reference snippet of code from ${displayPath(snippet.uri)}:\n\n${
                            snippet.content
                        }`
                    )
                }
            }

            const introString = `${intro
                .join('\n\n')
                .split('\n')
                .map(line => (languageConfig ? languageConfig.commentStart + line : '// '))
                .join('\n')}\n`

            // We want to remove the same line suffix from a completion request since both StarCoder and Llama
            // code can't handle this correctly.
            const suffixAfterFirstNewline = getSuffixAfterFirstNewline(suffix)

            const nextPrompt = this.createInfillingPrompt(
                vscode.workspace.asRelativePath(this.options.document.fileName),
                introString,
                prefix,
                suffixAfterFirstNewline
            )

            if (nextPrompt.length >= this.promptChars) {
                return prompt
            }

            prompt = nextPrompt
        }

        return prompt
    }

    public generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        const { partialRequestParams, fetchAndProcessCompletionsImpl } = getCompletionParamsAndFetchImpl(
            {
                providerOptions: this.options,
                timeouts: this.timeouts,
                lineNumberDependentCompletionParams,
            }
        )

        const { multiline } = this.options
        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: [{ speaker: 'human', text: this.createPrompt(snippets) }],
            temperature: 0.2,
            topK: 0,
            model:
                this.model === 'starcoder-hybrid'
                    ? MODEL_MAP[multiline ? 'starcoder-16b' : 'starcoder-7b']
                    : MODEL_MAP[this.model],
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: this.options.n }).map(() => {
            const abortController = forkSignal(abortSignal)

            const completionResponseGenerator = generatorWithTimeout(
                this.fastPathAccessToken
                    ? this.createFastPathClient(requestParams, abortController)
                    : this.createDefaultClient(requestParams, abortController),
                requestParams.timeoutMs,
                abortController
            )

            return fetchAndProcessCompletionsImpl({
                completionResponseGenerator,
                abortController,
                providerSpecificPostProcess: this.postProcess,
                providerOptions: this.options,
            })
        })

        /**
         * This implementation waits for all generators to yield values
         * before passing them to the consumer (request-manager). While this may appear
         * as a performance bottleneck, it's necessary for the current design.
         *
         * The consumer operates on promises, allowing only a single resolve call
         * from `requestManager.request`. Therefore, we must wait for the initial
         * batch of completions before returning them collectively, ensuring all
         * are included as suggested completions.
         *
         * To circumvent this performance issue, a method for adding completions to
         * the existing suggestion list is needed. Presently, this feature is not
         * available, and the switch to async generators maintains the same behavior
         * as with promises.
         */
        return zipGenerators(completionsGenerators)
    }

    private createInfillingPrompt(
        filename: string,
        intro: string,
        prefix: string,
        suffix: string
    ): string {
        if (isStarCoderFamily(this.model)) {
            // c.f. https://huggingface.co/bigcode/starcoder#fill-in-the-middle
            // c.f. https://arxiv.org/pdf/2305.06161.pdf
            return `<filename>${filename}<fim_prefix>${intro}${prefix}<fim_suffix>${suffix}<fim_middle>`
        }
        if (isLlamaCode(this.model)) {
            // c.f. https://github.com/facebookresearch/codellama/blob/main/llama/generation.py#L402
            return `<PRE> ${intro}${prefix} <SUF>${suffix} <MID>`
        }

        console.error('Could not generate infilling prompt for', this.model)
        return `${intro}${prefix}`
    }

    private postProcess = (content: string): string => {
        if (isStarCoderFamily(this.model)) {
            return content.replace(EOT_STARCODER, '')
        }
        if (isLlamaCode(this.model)) {
            return content.replace(EOT_LLAMA_CODE, '')
        }
        return content
    }

    private createDefaultClient(
        requestParams: CodeCompletionsParams,
        abortController: AbortController
    ): CompletionResponseGenerator {
        return this.client.complete(requestParams, abortController)
    }

    // When using the fast path, the Cody client talks directly to Cody Gateway. Since CG only
    // proxies to the upstream API, we have to first convert the request to a Fireworks API
    // compatible payload. We also have to manually convert SSE response chunks.
    //
    // Note: This client assumes that it is run inside a Node.js environment and will always use
    // streaming to simplify the logic. Environments that do not support that should fall back to
    // the default client.
    private createFastPathClient(
        requestParams: CodeCompletionsParams,
        abortController: AbortController
    ): CompletionResponseGenerator {
        const isLocalInstance =
            this.authStatus.endpoint?.includes('sourcegraph.test') ||
            this.authStatus.endpoint?.includes('localhost')
        const gatewayUrl = isLocalInstance
            ? 'http://localhost:9992'
            : 'https://cody-gateway.sourcegraph.com'

        const url = `${gatewayUrl}/v1/completions/fireworks`
        const log = this.client.logger?.startCompletion(requestParams, url)

        // The async generator can not use arrow function syntax so we close over the context
        const self = this

        return tracer.startActiveSpan(
            `POST ${url}`,
            async function* (span): CompletionResponseGenerator {
                // Convert the SG instance messages array back to the original prompt
                const prompt = requestParams.messages[0]!.text!

                // c.f. https://readme.fireworks.ai/reference/createcompletion
                const fireworksRequest = {
                    model: requestParams.model?.replace(/^fireworks\//, ''),
                    prompt,
                    max_tokens: requestParams.maxTokensToSample,
                    echo: false,
                    temperature: requestParams.temperature,
                    top_p: requestParams.topP,
                    top_k: requestParams.topK,
                    stop: requestParams.stopSequences,
                    stream: true,
                }

                const headers = new Headers()
                // Force HTTP connection reuse to reduce latency.
                // c.f. https://github.com/microsoft/vscode/issues/173861
                headers.set('Connection', 'keep-alive')
                headers.set('Content-Type', 'application/json; charset=utf-8')
                headers.set('Authorization', `Bearer ${self.fastPathAccessToken}`)
                headers.set('X-Sourcegraph-Feature', 'code_completions')
                addTraceparent(headers)

                logDebug('FireworksProvider', 'fetch', { verbose: { url, fireworksRequest } })
                const response = await fetch(url, {
                    method: 'POST',
                    body: JSON.stringify(fireworksRequest),
                    headers,
                    signal: abortController.signal,
                })

                logResponseHeadersToSpan(span, response)

                const traceId = getActiveTraceAndSpanId()?.traceId

                // When rate-limiting occurs, the response is an error message The response here is almost
                // identical to the SG instance response but does not contain information on whether a user
                // is eligible to upgrade to the pro plan. We get this from the authState instead.
                if (response.status === 429) {
                    const upgradeIsAvailable = self.authStatus.userCanUpgrade

                    throw recordErrorToSpan(
                        span,
                        await createRateLimitErrorFromResponse(response, upgradeIsAvailable)
                    )
                }

                if (!response.ok) {
                    throw recordErrorToSpan(
                        span,
                        new NetworkError(
                            response,
                            (await response.text()) +
                                (isLocalInstance ? '\nIs Cody Gateway running locally?' : ''),
                            traceId
                        )
                    )
                }

                if (response.body === null) {
                    throw recordErrorToSpan(span, new TracedError('No response body', traceId))
                }

                const isStreamingResponse = response.headers
                    .get('content-type')
                    ?.startsWith('text/event-stream')
                if (!isStreamingResponse || !isNodeResponse(response)) {
                    throw recordErrorToSpan(
                        span,
                        new TracedError('No streaming response given', traceId)
                    )
                }

                let lastResponse: CompletionResponse | undefined
                try {
                    const iterator = createSSEIterator(response.body)
                    let chunkIndex = 0

                    for await (const { event, data } of iterator) {
                        if (event === 'error') {
                            throw new TracedError(data, traceId)
                        }

                        if (abortController.signal.aborted) {
                            if (lastResponse) {
                                lastResponse.stopReason = CompletionStopReason.RequestAborted
                            }
                            break
                        }

                        // [DONE] is a special non-JSON message to indicate the end of the stream
                        if (data === '[DONE]') {
                            break
                        }

                        const parsed = JSON.parse(data) as FireworksSSEData
                        const choice = parsed.choices[0]

                        if (!choice) {
                            continue
                        }

                        lastResponse = {
                            completion: (lastResponse ? lastResponse.completion : '') + choice.text,
                            stopReason:
                                choice.finish_reason ??
                                (lastResponse
                                    ? lastResponse.stopReason
                                    : CompletionStopReason.StreamingChunk),
                        }

                        span.addEvent('yield', { stopReason: lastResponse.stopReason })
                        yield lastResponse

                        chunkIndex += 1
                    }

                    if (lastResponse === undefined) {
                        throw new TracedError('No completion response received', traceId)
                    }

                    if (!lastResponse.stopReason) {
                        lastResponse.stopReason = CompletionStopReason.RequestFinished
                    }

                    return lastResponse
                } catch (error) {
                    // In case of the abort error and non-empty completion response, we can
                    // consider the completion partially completed and want to log it to
                    // the Cody output channel via `log.onComplete()` instead of erroring.
                    if (isAbortError(error as Error) && lastResponse) {
                        lastResponse.stopReason = CompletionStopReason.RequestAborted
                        return
                    }

                    recordErrorToSpan(span, error as Error)

                    if (isRateLimitError(error as Error)) {
                        throw error
                    }

                    const message = `error parsing streaming CodeCompletionResponse: ${error}`
                    log?.onError(message, error)
                    throw new TracedError(message, traceId)
                } finally {
                    if (lastResponse) {
                        span.addEvent('return', { stopReason: lastResponse.stopReason })
                        span.setStatus({ code: SpanStatusCode.OK })
                        span.end()
                        log?.onComplete(lastResponse)
                    }
                }
            }
        )
    }
}

export function createProviderConfig({
    model,
    timeouts,
    ...otherOptions
}: Omit<FireworksOptions, 'model' | 'maxContextTokens'> & {
    model: string | null
}): ProviderConfig {
    const resolvedModel =
        model === null || model === ''
            ? 'starcoder-hybrid'
            : model === 'starcoder-hybrid'
              ? 'starcoder-hybrid'
              : Object.prototype.hasOwnProperty.call(MODEL_MAP, model)
                  ? (model as keyof typeof MODEL_MAP)
                  : null

    if (resolvedModel === null) {
        throw new Error(`Unknown model: \`${model}\``)
    }

    const maxContextTokens = getMaxContextTokens(resolvedModel)

    return {
        create(options: ProviderOptions) {
            return new FireworksProvider(
                {
                    ...options,
                    id: PROVIDER_IDENTIFIER,
                },
                {
                    model: resolvedModel,
                    maxContextTokens,
                    timeouts,
                    ...otherOptions,
                }
            )
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        identifier: PROVIDER_IDENTIFIER,
        model: resolvedModel,
    }
}

function isStarCoderFamily(model: string): boolean {
    return model.startsWith('starcoder')
}

function isLlamaCode(model: string): boolean {
    return model.startsWith('llama-code')
}

interface FireworksSSEData {
    choices: [{ text: string; finish_reason: null }]
}

function dotcomTokenToGatewayToken(dotcomToken: string): string | undefined {
    const DOTCOM_TOKEN_REGEX: RegExp =
        /^(?:sgph?_)?(?:[\da-fA-F]{16}_|local_)?(?<hexbytes>[\da-fA-F]{40})$/
    const match = DOTCOM_TOKEN_REGEX.exec(dotcomToken)

    if (!match) {
        throw new Error('Access token format is invalid.')
    }

    const hexEncodedAccessTokenBytes = match?.groups?.hexbytes

    if (!hexEncodedAccessTokenBytes) {
        throw new Error('Access token not found.')
    }

    const accessTokenBytes = enc.Hex.parse(hexEncodedAccessTokenBytes)
    const gatewayTokenBytes = SHA256(SHA256(accessTokenBytes)).toString()
    return 'sgd_' + gatewayTokenBytes
}
