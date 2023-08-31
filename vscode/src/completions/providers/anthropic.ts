import * as anthropic from '@anthropic-ai/sdk'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { canUsePartialCompletion } from '../streaming'
import {
    CLOSING_CODE_TAG,
    extractFromCodeBlock,
    fixBadCompletionStart,
    getHeadAndTail,
    OPENING_CODE_TAG,
    PrefixComponents,
    trimLeadingWhitespaceUntilNewline,
} from '../text-processing'
import { Completion, ContextSnippet } from '../types'
import { forkSignal, messagesToText } from '../utils'

import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './provider'

const CHARS_PER_TOKEN = 4

function tokensToChars(tokens: number): number {
    return tokens * CHARS_PER_TOKEN
}

interface AnthropicOptions {
    contextWindowTokens: number
    completionsClient: Pick<SourcegraphCompletionsClient, 'complete'>
}

export class AnthropicProvider extends Provider {
    private promptChars: number
    private responseTokens: number
    private completionsClient: Pick<SourcegraphCompletionsClient, 'complete'>

    constructor(options: ProviderOptions, anthropicOptions: AnthropicOptions) {
        super(options)
        this.promptChars =
            tokensToChars(anthropicOptions.contextWindowTokens) -
            Math.floor(tokensToChars(anthropicOptions.contextWindowTokens) * options.responsePercentage)
        this.responseTokens = Math.floor(anthropicOptions.contextWindowTokens * options.responsePercentage)
        this.completionsClient = anthropicOptions.completionsClient
    }

    public emptyPromptLength(): number {
        const { messages } = this.createPromptPrefix()
        const promptNoSnippets = messagesToText(messages)
        return promptNoSnippets.length - 10 // extra 10 chars of buffer cuz who knows
    }

    private createPromptPrefix(): { messages: Message[]; prefix: PrefixComponents } {
        // TODO(beyang): escape 'Human:' and 'Assistant:'
        const prefixLines = this.options.docContext.prefix.split('\n')
        if (prefixLines.length === 0) {
            throw new Error('no prefix lines')
        }

        const { head, tail, overlap } = getHeadAndTail(this.options.docContext.prefix)
        const prefixMessages: Message[] = [
            {
                speaker: 'human',
                text: 'You are a code completion AI that refers to shared context to write high-quality and efficient code that fits and works seamlessly with surrounding code.',
            },
            {
                speaker: 'assistant',
                text: 'I am a code completion AI that writes high-quality code that fits and works seamlessly with its surrounding code.',
            },
            // {
            //     speaker: 'human',
            //     text: `Here is the code that goes before the code you will be completing for:${head.trimmed}`,
            // },
            // {
            //     speaker: 'assistant',
            //     text: 'Reviewed. I will complete the next code completion request that comes after this code snippet.',
            // },
            {
                speaker: 'human',
                text: `As a code completion AI that writes high-quality code, complete the code enclosed in the ${OPENING_CODE_TAG} below so that it flows and works seamlessly with its surrounding code. It is important the style and pattern used in the new code is consistent with surrounding code and use the same naming convention. For examples, 1) when writing a comment, following the styles and patterns of the exisiting comments when available, 2) declare return types for functions when functions in the surrounding code do. Do not reuse function names or repeat the same code exists in surrounding code. Do not complete code that uses methods or libraries not imported in current file. Do not repeat code, functions or methods that exist in the shared context. Focus on writing clean, efficient code that works seamlessly with surrounding code. Complete the code in ${OPENING_CODE_TAG}:
                ${head.trimmed}${OPENING_CODE_TAG}${tail.trimmed}${CLOSING_CODE_TAG}${this.options.docContext.suffix}`,
            },
            // {
            //     speaker: 'human',
            //     text: `As a code completion AI that writes high-quality code, complete the end of the code in ${OPENING_CODE_TAG} tags so that it works seamlessly with the code before it, alongside with the code enclosed in the <AFTER> tags. It is important the new code remains consistent with the rest of the file for maintainability. For example, when writing a comment, following the styles and patterns of the exisiting comments when available. Feel free to reuse code patterns and idioms that appear elsewhere in the file but do not create any functions or methods that already exist in any shared context provided: ${OPENING_CODE_TAG}${head.trimmed}${CLOSING_CODE_TAG}<AFTER>${this.options.docContext.suffix}</AFTER>`,
            // },
            {
                speaker: 'assistant',
                text: `Here is the code: ${OPENING_CODE_TAG}${tail.trimmed}`,
            },
        ]
        return { messages: prefixMessages, prefix: { head, tail, overlap } }
    }

    // Creates the resulting prompt and adds as many snippets from the reference
    // list as possible.
    protected createPrompt(snippets: ContextSnippet[]): { messages: Message[]; prefix: PrefixComponents } {
        const { messages: prefixMessages, prefix } = this.createPromptPrefix()

        const referenceSnippetMessages: Message[] = []

        let remainingChars = this.promptChars - this.emptyPromptLength()

        for (const snippet of snippets) {
            const snippetMessages: Message[] = [
                {
                    speaker: 'human',
                    text: `Codebase context from a file with file path ${snippet.fileName}: ${OPENING_CODE_TAG}${snippet.content}${CLOSING_CODE_TAG}`,
                },
                {
                    speaker: 'assistant',
                    text: 'I will refer to this code when completing your next request.',
                },
            ]
            const numSnippetChars = messagesToText(snippetMessages).length + 1
            if (numSnippetChars > remainingChars) {
                break
            }
            referenceSnippetMessages.push(...snippetMessages)
            remainingChars -= numSnippetChars
        }

        return { messages: [...referenceSnippetMessages, ...prefixMessages], prefix }
    }

    // Returns completions based on the generated prompt
    public async generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): Promise<Completion[]> {
        // Create prompt
        const { messages: prompt } = this.createPrompt(snippets)
        if (prompt.length > this.promptChars) {
            throw new Error(`prompt length (${prompt.length}) exceeded maximum character length (${this.promptChars})`)
        }

        const args: CompletionParameters = this.options.multiline
            ? {
                  temperature: 0.5,
                  messages: prompt,
                  maxTokensToSample: this.responseTokens,
                  stopSequences: [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG],
              }
            : {
                  temperature: 0.5,
                  messages: prompt,
                  maxTokensToSample: Math.min(50, this.responseTokens),
                  stopSequences: [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG, '\n\n'],
              }
        tracer?.params(args)

        // Issue request
        const responses = await this.batchAndProcessCompletions(
            this.completionsClient,
            args,
            this.options.n,
            abortSignal
        )

        // Post-process
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
        client: Pick<SourcegraphCompletionsClient, 'complete'>,
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

    private postProcess(rawResponse: string): string {
        let completion = extractFromCodeBlock(rawResponse)

        const trimmedPrefixContainNewline = this.options.docContext.prefix
            .slice(this.options.docContext.prefix.trimEnd().length)
            .includes('\n')
        if (trimmedPrefixContainNewline) {
            // The prefix already contains a `\n` that Claude was not aware of, so we remove any
            // leading `\n` followed by whitespace that Claude might add.
            completion = completion.replace(/^\s*\n\s*/, '')
        } else {
            completion = trimLeadingWhitespaceUntilNewline(completion)
        }

        // Remove bad symbols from the start of the completion string.
        completion = fixBadCompletionStart(completion)

        return completion
    }
}

export function createProviderConfig(anthropicOptions: AnthropicOptions): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new AnthropicProvider(options, anthropicOptions)
        },
        maximumContextCharacters: tokensToChars(anthropicOptions.contextWindowTokens),
        enableExtendedMultilineTriggers: true,
        identifier: 'anthropic',
        supportsInfilling: false,
    }
}
