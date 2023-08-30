import type { Response as NodeResponse } from 'node-fetch'

import { OllamaGenerateParameters, OllamaOptions } from '@sourcegraph/cody-shared/src/modelProviders/ollama'
import { isAbortError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'

import { BrowserOrNodeResponse, fetch } from '../../fetch'
import { logger } from '../../log'
import { Completion, ContextSnippet } from '../types'

import { Provider, ProviderConfig, ProviderOptions } from './provider'

export function createOllamaProviderConfig(ollamaOptions: OllamaOptions): ProviderConfig {
    const contextWindowSize = ollamaOptions.parameters?.num_ctx ?? charsToTokens(768)
    return {
        create(options: ProviderOptions) {
            return new OllamaProvider(options, {
                ...ollamaOptions,
                parameters: {
                    seed: 1337,
                    num_ctx: contextWindowSize,
                    stop: ['\n\n'],
                    penalize_newline: true,
                    ...ollamaOptions.parameters,
                },
            })
        },
        maximumContextCharacters: tokensToChars(contextWindowSize),
        enableExtendedMultilineTriggers: true,
        identifier: PROVIDER_IDENTIFIER,
        model: ollamaOptions.model,
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
}

interface OllamaGenerateErrorResponse {
    error?: string
}

interface LlamaCodePrompt {
    snippets: { fileName: string; content: string }[]

    fileName: string
    prefix: string
    suffix: string
}

function llamaCodePromptString(prompt: LlamaCodePrompt): string {
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
        `// Path: ${prompt.fileName}\n` +
        prompt.prefix
    )
}

const CHARS_PER_TOKEN = 4 // TODO(sqs): estimate

function charsToTokens(chars: number): number {
    return Math.ceil(chars / CHARS_PER_TOKEN)
}

function tokensToChars(tokens: number): number {
    return Math.floor(tokens * CHARS_PER_TOKEN)
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
        private readonly ollamaOptions: OllamaOptions &
            Required<Pick<OllamaOptions, 'parameters'>> & { parameters: { num_ctx: number } }
    ) {
        super(options)
    }

    protected createPrompt(snippets: ContextSnippet[]): LlamaCodePrompt {
        const maxPromptChars = tokensToChars(
            this.ollamaOptions.parameters.num_ctx * (1 - this.options.responsePercentage)
        )

        const prompt: LlamaCodePrompt = {
            snippets: [],
            fileName: this.options.fileName,
            prefix: this.options.docContext.prefix,
            suffix: this.options.docContext.suffix,
        }
        for (const snippet of snippets) {
            const extendedSnippets = [...prompt.snippets, snippet]
            const promptLengthWithSnippet = llamaCodePromptString({ ...prompt, snippets: extendedSnippets }).length
            if (promptLengthWithSnippet > maxPromptChars) {
                break
            }
            prompt.snippets = extendedSnippets
        }
        return prompt
    }

    public async generateCompletions(abortSignal: AbortSignal, snippets: ContextSnippet[]): Promise<Completion[]> {
        const request: OllamaGenerateRequest = {
            prompt: llamaCodePromptString(this.createPrompt(snippets)),
            template: '{{ .Prompt }}',
            model: this.ollamaOptions.model,
            options: {
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
            }
            if (response instanceof Response) {
                await readStreamBrowser(processLine)(response)
            } else {
                await readStreamNode(processLine)(response)
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
