import type { Response as NodeResponse } from 'node-fetch'

import { isDefined } from '@sourcegraph/cody-shared'
import { OllamaGenerateParameters, OllamaOptions } from '@sourcegraph/cody-shared/src/modelProviders/ollama'
import { isAbortError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import { BrowserOrNodeResponse, fetch } from '../../fetch'
import { logDebug, logger } from '../../log'
import { Completion, ContextSnippet } from '../types'

import { Provider, ProviderConfig, ProviderOptions } from './provider'

export function createOllamaProviderConfig(ollamaOptions: OllamaOptions): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new OllamaProvider(options, {
                ...ollamaOptions,
                parameters: {
                    seed: 1337,
                    stop: [
                        '\n\n',
                        '// Path:',
                        '\u001E',
                        '\u001C',
                        INFILL_TOKENS.EOT,

                        // Tokens that reduce the quality of multi-line completions but improve performance.
                        '}\n',
                    ],
                    temperature: 0.5,
                    top_k: -1,
                    top_p: -1,
                    ...ollamaOptions.parameters,
                },
            })
        },
        contextSizeHints: {
            // Ollama evaluates the prompt at ~50 tok/s for codellama:7b-code on a MacBook Air M2.
            // If the prompt has a common prefix across inference requests, subsequent requests do
            // not incur prompt reevaluation and are therefore much faster. So, we want a large
            // document prefix that covers the entire document (except in cases where the document
            // is very, very large, in which case Ollama would not work well anyway).
            prefixChars: 10000,

            // For the same reason above, we want a very small suffix because otherwise Ollama needs to
            // reevaluate more tokens in the prompt. This is because the prompt is (roughly) `prefix
            // (cursor position) suffix`, so even typing a single character at the cursor position
            // invalidates the LLM's cache of the suffix.
            suffixChars: 5,
        },
        enableExtendedMultilineTriggers: true,
        identifier: PROVIDER_IDENTIFIER,
        model: ollamaOptions.model,
        useLongerDebounce: true,
    }
}

const PROVIDER_IDENTIFIER = 'ollama'

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L35
 */
interface OllamaGenerateRequest {
    model: string
    template: string
    prompt: string
    options?: OllamaGenerateParameters
}

/**
 * @see https://sourcegraph.com/github.com/jmorganca/ollama/-/blob/api/types.go?L88
 */
interface OllamaGenerateResponse {
    model: string
    response?: string
    done: boolean
    context?: number[]
    total_duration?: number
    load_duration?: number
    prompt_eval_count?: number
    prompt_eval_duration?: number
    eval_count?: number
    eval_duration?: number
    sample_count?: number
    sample_duration?: number
}

interface OllamaGenerateErrorResponse {
    error?: string
}

/** Special tokens for Code Llama infill. */
const INFILL_TOKENS = {
    PRE: ' <PRE>',
    SUF: ' <SUF>',
    MID: ' <MID>',
    EOT: ' <EOT>',
}

interface LlamaCodePrompt {
    snippets: { fileName: string; content: string }[]

    fileName: string
    prefix: string
    suffix: string
}

function llamaCodePromptString(prompt: LlamaCodePrompt, infill: boolean): string {
    // TODO(sqs): use the correct comment syntax for the language (eg '#' for Python, not '//').
    return (
        prompt.snippets
            .map(
                ({ fileName, content }) =>
                    `// Path: ${fileName}\n${content
                        .split('\n')
                        .map(line => `// ${line}`)
                        .join('\n')}`
            )
            .join('\n\n') +
        (infill
            ? `${INFILL_TOKENS.PRE}// Path: ${prompt.fileName}\n${prompt.prefix}${INFILL_TOKENS.SUF}${prompt.suffix}${INFILL_TOKENS.MID}`
            : `// Path: ${prompt.fileName}\n${prompt.prefix}`)
    )
}

/**
 * An *experimental* completion provider that uses [Ollama](https://ollama.ai), which is a tool for
 * running LLMs locally.
 *
 * The provider communicates with an Ollama server's [REST
 * API](https://github.com/jmorganca/ollama#rest-api).
 */
class OllamaProvider extends Provider {
    constructor(
        options: ProviderOptions,
        private readonly ollamaOptions: OllamaOptions
    ) {
        super(options)
    }

    protected createPrompt(snippets: ContextSnippet[], infill: boolean): LlamaCodePrompt {
        const prompt: LlamaCodePrompt = {
            snippets: [],
            fileName: this.options.fileName,
            prefix: this.options.docContext.prefix,
            suffix: this.options.docContext.suffix,
        }
        if (process.env.OTHER_FILES) {
            // TODO(sqs)
            const maxPromptChars = 1234 /* tokensToChars(
                this.ollamaOptions.parameters.num_ctx * (1 - this.options.responsePercentage)
            )    */
            for (const snippet of snippets) {
                const extendedSnippets = [...prompt.snippets, snippet]
                const promptLengthWithSnippet = llamaCodePromptString(
                    { ...prompt, snippets: extendedSnippets },
                    infill
                ).length
                if (promptLengthWithSnippet > maxPromptChars) {
                    break
                }
                prompt.snippets = extendedSnippets
            }
        }
        return prompt
    }

    public async generateCompletions(abortSignal: AbortSignal, snippets: ContextSnippet[]): Promise<Completion[]> {
        // Only use infill if the suffix has alphanumerics, where it might give us a var name we should refer to. TODO(sqs): playing around with this...
        const useInfill = /\s*\w/.test(this.options.docContext.suffix)
        const request: OllamaGenerateRequest = {
            prompt: llamaCodePromptString(this.createPrompt(snippets, useInfill), useInfill),
            template: '{{ .Prompt }}',
            model: this.ollamaOptions.model,
            options: {
                num_predict: this.options.multiline ? 100 : 15,
                ...this.ollamaOptions.parameters,
                stop: this.options.multiline
                    ? this.ollamaOptions.parameters?.stop
                    : [...(this.ollamaOptions.parameters?.stop ?? []), '\n'],
            },
        }

        const log = logger.startCompletion({
            request,
            provider: PROVIDER_IDENTIFIER,
            serverEndpoint: this.ollamaOptions.url,
        })

        let responseText = ''

        try {
            const response: BrowserOrNodeResponse = await fetch(new URL('/api/generate', this.ollamaOptions.url), {
                method: 'POST',
                body: JSON.stringify(request),
                headers: {
                    'Content-Type': 'application/json',
                },
                signal: abortSignal,
            })
            if (!response.ok) {
                const errorResponse = (await response.json()) as OllamaGenerateErrorResponse
                throw new Error(`ollama generation error: ${errorResponse?.error || 'unknown error'}`)
            }

            const processLine = (line: OllamaGenerateResponse): void => {
                if (line.response) {
                    responseText += line.response
                }
                if (line.done && line.total_duration) {
                    const logKeys: (keyof OllamaGenerateResponse)[] = [
                        'total_duration',
                        'load_duration',
                        'prompt_eval_count',
                        'prompt_eval_duration',
                        'eval_count',
                        'eval_duration',
                        'sample_count',
                        'sample_duration',
                    ]
                    logDebug(
                        'ollama',
                        'generation done',
                        [
                            ...logKeys
                                .filter(key => line[key] !== undefined)
                                .map(
                                    key =>
                                        `${key}=${
                                            key.endsWith('_duration')
                                                ? `${(line[key] as number) / 1000000}ms`
                                                : line[key]
                                        }`
                                ),
                            line.prompt_eval_count !== undefined && line.prompt_eval_duration !== undefined
                                ? `prompt_eval_tok/sec=${
                                      line.prompt_eval_count / (line.prompt_eval_duration / 1000000000)
                                  }`
                                : null,
                            line.eval_count !== undefined && line.eval_duration !== undefined
                                ? `response_tok/sec=${line.eval_count / (line.eval_duration / 1000000000)}`
                                : null,
                        ]
                            .filter(isDefined)
                            .join(' ')
                    )
                }
            }
            if (isNodeResponse(response)) {
                await readStreamNode(processLine)(response)
            } else {
                await readStreamBrowser(processLine)(response)
            }

            const completions: Completion[] = responseText ? [{ content: postProcess(responseText) }] : []
            log?.onComplete(completions.map(c => c.content))
            return completions
        } catch (error: any) {
            if (!isAbortError(error)) {
                log?.onError(error)
            }
            throw error
        }
    }
}

function postProcess(content: string): string {
    return content.trim()
}

function isNodeResponse(response: BrowserOrNodeResponse): response is NodeResponse {
    return Boolean(response.body && !('getReader' in response.body))
}

const readStreamBrowser =
    <L>(processLine: (line: L) => void) =>
    (response: Response) => {
        if (!response.body) {
            throw new Error('response has no body')
        }
        const stream = response.body.getReader()
        const matcher = /\r?\n/
        const decoder = new TextDecoder()
        let buf = ''

        const loop = (): Promise<void> =>
            stream.read().then(({ done, value }) => {
                if (done) {
                    if (buf.length > 0) {
                        processLine(JSON.parse(buf))
                    }
                } else {
                    const chunk = decoder.decode(value, { stream: true })
                    buf += chunk

                    const parts = buf.split(matcher)
                    buf = parts.pop() ?? ''
                    for (const i of parts.filter(p => p)) {
                        processLine(JSON.parse(i))
                    }
                    return loop()
                }
                return
            })

        return loop()
    }

const readStreamNode =
    <L>(processLine: (line: L) => void) =>
    (response: NodeResponse) => {
        const matcher = /\r?\n/
        const decoder = new TextDecoder()
        let buf = ''
        const responseBody = response.body
        if (!responseBody) {
            throw new Error('response has no body')
        }
        return new Promise<void>((resolve, reject) => {
            responseBody.on('data', v => {
                const chunk = decoder.decode(v, { stream: true })
                buf += chunk

                const parts = buf.split(matcher)
                buf = parts.pop() ?? ''
                for (const i of parts.filter(p => p)) {
                    processLine(JSON.parse(i))
                }
            })
            responseBody.on('end', () => {
                if (buf.length > 0) {
                    processLine(JSON.parse(buf))
                }
                resolve()
            })
            responseBody.on('error', error => {
                reject(error)
            })
        })
    }
