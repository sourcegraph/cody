import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { CodeCompletionsClient } from '../client'
import { canUsePartialCompletion } from '../streaming'
import { Completion, ContextSnippet } from '../types'
import { forkSignal } from '../utils'

import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './provider'

interface UnstableAzureOpenAIOptions {
    client: Pick<CodeCompletionsClient, 'complete'>
    contextWindowTokens: number
}

const PROVIDER_IDENTIFIER = 'unstable-azure-openai'
const CONTEXT_WINDOW_CHARS = 2048
const EOT_OPENAI = '<|im_end|>'
const MAX_RESPONSE_TOKENS = 256

const CHARS_PER_TOKEN = 4

function tokensToChars(tokens: number): number {
    return tokens * CHARS_PER_TOKEN
}

export class UnstableAzureOpenAIProvider extends Provider {
    private client: Pick<CodeCompletionsClient, 'complete'>
    private promptChars: number

    constructor(options: ProviderOptions, azureOpenAIOptions: UnstableAzureOpenAIOptions) {
        super(options)
        this.client = azureOpenAIOptions.client
        this.promptChars = tokensToChars(azureOpenAIOptions.contextWindowTokens) - tokensToChars(MAX_RESPONSE_TOKENS)
    }

    private createPrompt(snippets: ContextSnippet[]): string {
        const { prefix } = this.options.docContext

        const intro: string[] = []
        let prompt = ''

        for (let snippetsToInclude = 0; snippetsToInclude < snippets.length + 1; snippetsToInclude++) {
            if (snippetsToInclude > 0) {
                const snippet = snippets[snippetsToInclude - 1]
                intro.push(`Here is a reference snippet of code from ${snippet.fileName}:\n\n${snippet.content}`)
            }
            const introString = intro.join('\n\n')
            const nextPrompt = `Complete the following code:\n\n${introString}${prefix}`

            if (nextPrompt.length >= this.promptChars) {
                return prompt
            }

            prompt = nextPrompt
        }

        return prompt
    }

    public async generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): Promise<Completion[]> {
        const prompt = this.createPrompt(snippets)

        const args: CompletionParameters = {
            messages: [{ speaker: 'human', text: prompt }],
            maxTokensToSample: this.options.multiline ? MAX_RESPONSE_TOKENS : 50,
            temperature: 0.4,
            topP: 0.95,
        }

        tracer?.params(args)

        // Issue request
        const responses = await this.batchAndProcessCompletions(this.client, args, this.options.n, abortSignal)

        const ret = responses.map(resp => [
            {
                prefix: this.options.docContext.prefix,
                content: resp.completion,
                stopReason: resp.stopReason,
            },
        ])

        const completions = ret.flat()
        tracer?.result({ rawResponses: responses, completions })

        return completions
    }

    private async batchAndProcessCompletions(
        client: Pick<CodeCompletionsClient, 'complete'>,
        params: CompletionParameters,
        n: number,
        abortSignal: AbortSignal
    ): Promise<CompletionResponse[]> {
        const responses: Promise<CompletionResponse>[] = []
        for (let i = 0; i < n; i++) {
            responses.push(this.fetchAndProcessCompletions(client, params, abortSignal))
        }
        return Promise.all(responses)
    }

    private async fetchAndProcessCompletions(
        client: Pick<CodeCompletionsClient, 'complete'>,
        params: CompletionParameters,
        abortSignal: AbortSignal
    ): Promise<CompletionResponse> {
        // The Async executor is required to return the completion early if a partial result from SSE can be used.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            try {
                const abortController = forkSignal(abortSignal)

                const result = await client.complete(
                    params,
                    (incompleteResponse: CompletionResponse) => {
                        const processedCompletion = this.postProcess(incompleteResponse.completion)
                        if (
                            canUsePartialCompletion(processedCompletion, {
                                document: { languageId: this.options.languageId },
                                multiline: this.options.multiline,
                                docContext: this.options.docContext,
                            })
                        ) {
                            resolve({ ...incompleteResponse, completion: processedCompletion })
                            abortController.abort()
                        }
                    },
                    abortController.signal
                )

                resolve({ ...result, completion: this.postProcess(result.completion) })
            } catch (error) {
                reject(error)
            }
        })
    }

    private postProcess(content: string): string {
        return content.replace(EOT_OPENAI, '')
    }
}

export function createProviderConfig(unstableAzureOpenAIOptions: UnstableAzureOpenAIOptions): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new UnstableAzureOpenAIProvider(options, { ...unstableAzureOpenAIOptions })
        },
        maximumContextCharacters: CONTEXT_WINDOW_CHARS,
        enableExtendedMultilineTriggers: false,
        identifier: PROVIDER_IDENTIFIER,
        supportsInfilling: false,
        model: 'azure-openai',
    }
}
