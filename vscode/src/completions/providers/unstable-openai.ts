import { tokensToChars } from '@sourcegraph/cody-shared/src/prompt/constants'
import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { CodeCompletionsClient } from '../client'
import { canUsePartialCompletion } from '../streaming'
import { getHeadAndTail } from '../text-processing'
import { Completion, ContextSnippet } from '../types'
import { forkSignal } from '../utils'

import {
    CompletionProviderTracer,
    Provider,
    ProviderConfig,
    ProviderOptions,
    standardContextSizeHints,
} from './provider'

interface UnstableOpenAIOptions {
    maxContextTokens?: number
    client: Pick<CodeCompletionsClient, 'complete'>
}

const PROVIDER_IDENTIFIER = 'unstable-openai'
const MAX_RESPONSE_TOKENS = 256
const OPENING_CODE_TAG = '```'
const CLOSING_CODE_TAG = '```'

export class UnstableOpenAIProvider extends Provider {
    private client: Pick<CodeCompletionsClient, 'complete'>
    private promptChars: number

    constructor(options: ProviderOptions, { maxContextTokens, client }: Required<UnstableOpenAIOptions>) {
        super(options)
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.client = client
    }

    private createPrompt(snippets: ContextSnippet[]): string {
        const { head, tail } = getHeadAndTail(this.options.docContext.prefix)
        const intro: string[] = ['Human: You are a senior engineer assistant working on a codebase.']
        let prompt = ''

        for (let snippetsToInclude = 0; snippetsToInclude < snippets.length + 1; snippetsToInclude++) {
            if (snippetsToInclude > 0) {
                const snippet = snippets[snippetsToInclude - 1]
                intro.push(`File: ${snippet.fileName}\n${OPENING_CODE_TAG}\n${snippet.content}\n${CLOSING_CODE_TAG}`)
            }
            const introString = intro.join('\n\n')
            const nextPrompt = `${introString}\n\nComplete the following code:\n\n${head.trimmed}\n\nAssistant:\n${tail.trimmed}`

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

        const stopSequences = ['Human:', 'Assistant:']
        if (!this.options.multiline) {
            stopSequences.push('\n')
        }

        const args: CompletionParameters = {
            messages: [{ speaker: 'human', text: prompt }],
            maxTokensToSample: this.options.multiline ? MAX_RESPONSE_TOKENS : 50,
            temperature: 1,
            topP: 0.5,
            stopSequences,
        }

        tracer?.params(args)

        // Issue request
        const responses = await Promise.all(
            Array.from({ length: this.options.n }).map(() => {
                return this.fetchAndProcessCompletions(this.client, args, abortSignal)
            })
        )

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
        return content.trimEnd()
    }
}

export function createProviderConfig({
    model,
    maxContextTokens = 2048,
    ...otherOptions
}: UnstableOpenAIOptions & { model?: string }): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new UnstableOpenAIProvider(options, { maxContextTokens, ...otherOptions })
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        enableExtendedMultilineTriggers: false,
        identifier: PROVIDER_IDENTIFIER,
        model: model ?? 'gpt-35-turbo',
    }
}
