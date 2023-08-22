import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

//import { logger } from '../../log'
import { canUsePartialCompletion } from '../streaming'
import { getHeadAndTail } from '../text-processing'
import { Completion, ContextSnippet } from '../types'
import { forkSignal } from '../utils'

import { Provider, ProviderConfig, ProviderOptions } from './provider'

interface AzureOpenAIOptions {
    // promptChars: number
    // responseTokens: number
    completionsClient: Pick<SourcegraphCompletionsClient, 'complete'>
}

const OPENING_CODE_TAG = '```'
const CLOSING_CODE_TAG = '```'

const PROVIDER_IDENTIFIER = 'openai-azure'

export class AzureOpenAIProvider extends Provider {
    // private promptChars: number
    // private responseTokens: number
    private completionsClient: Pick<SourcegraphCompletionsClient, 'complete'>

    constructor(options: ProviderOptions, unstableAzureOpenAIOptions: AzureOpenAIOptions) {
        super(options)
        this.completionsClient = unstableAzureOpenAIOptions.completionsClient
    }

    public async generateCompletions(abortSignal: AbortSignal, snippets: ContextSnippet[]): Promise<Completion[]> {
        const { head, tail } = getHeadAndTail(this.options.docContext.prefix)

        // Create prompt
        // Although we are using gpt-35-turbo in text completion
        // mode, and not in chat completion mode, it turns out that the model
        // still seems to work well in a conversational style.
        const introSection = 'Human: You are a senior engineer assistant working on a codebase.\n\n'
        const referenceSnippetsSection = snippets
            .map(s => `File: ${s.fileName}\n${OPENING_CODE_TAG}\n${s.content}\n${CLOSING_CODE_TAG}\n\n`)
            .join('')
        const finalSection = `Complete the following code:\n\n${head.trimmed}\n\nAssistant:\n${tail.trimmed}`
        const prompt = introSection + referenceSnippetsSection + finalSection

        const stopSequences = ['Human:', 'Assistant:']
        if (!this.options.multiline) {
            stopSequences.push('\n')
        }

        // Issue request
        const request = {
            prompt,
            messages: [],
            temperature: 1,
            top_p: 0.5,
            frequency_penalty: 0,
            presence_penalty: 0,
            maxTokensToSample: this.options.multiline ? 256 : 50,
            stop: stopSequences,
        }

        const resp = await this.fetchAndProcessCompletions(this.completionsClient, request, abortSignal)

        const completion = {
            prefix: this.options.docContext.prefix,
            content: resp.completion,
            stopReason: resp.stopReason,
        }
        return [completion]
    }

    private async fetchAndProcessCompletions(
        client: Pick<SourcegraphCompletionsClient, 'complete'>,
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
                        const processedCompletion = postProcess(incompleteResponse.completion)
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

                resolve({ ...result, completion: postProcess(result.completion) })
            } catch (error) {
                reject(error)
            }
        })
    }
}

function postProcess(content: string): string {
    return content.trimEnd()
}

export function createAzureOpenAIProviderConfig(azureOpenAIOptions: AzureOpenAIOptions): ProviderConfig {
    const contextWindowChars = 8_000 // ~ 2k token limit
    return {
        create(options: ProviderOptions) {
            return new AzureOpenAIProvider(options, azureOpenAIOptions)
        },
        maximumContextCharacters: contextWindowChars,
        enableExtendedMultilineTriggers: false,
        identifier: PROVIDER_IDENTIFIER,
        supportsInfilling: true,
    }
}
