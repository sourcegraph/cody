import * as anthropic from '@anthropic-ai/sdk'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { CodeCompletionsClient } from '../client'
import { canUsePartialCompletion } from '../streaming'
import {
    CLOSING_CODE_TAG,
    extractFromCodeBlock,
    fixBadCompletionStart,
    formatSymbolContextRelationship,
    getHeadAndTail,
    MULTILINE_STOP_SEQUENCE,
    OPENING_CODE_TAG,
    PrefixComponents,
    trimLeadingWhitespaceUntilNewline,
} from '../text-processing'
import { Completion, ContextSnippet } from '../types'
import { forkSignal, messagesToText } from '../utils'

import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './provider'

const CHARS_PER_TOKEN = 4
export const MULTI_LINE_STOP_SEQUENCES = [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG]
export const SINGLE_LINE_STOP_SEQUENCES = [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG, MULTILINE_STOP_SEQUENCE]

function tokensToChars(tokens: number): number {
    return tokens * CHARS_PER_TOKEN
}

interface AnthropicOptions {
    contextWindowTokens: number
    client: Pick<CodeCompletionsClient, 'complete'>
    mode?: 'default' | 'infill'
}

export class AnthropicProvider extends Provider {
    private promptChars: number
    private responseTokens: number
    private client: Pick<CodeCompletionsClient, 'complete'>
    private useInfillPrefix = false

    constructor(options: ProviderOptions, anthropicOptions: AnthropicOptions) {
        super(options)
        this.promptChars =
            tokensToChars(anthropicOptions.contextWindowTokens) -
            Math.floor(tokensToChars(anthropicOptions.contextWindowTokens) * options.responsePercentage)
        this.responseTokens = Math.floor(anthropicOptions.contextWindowTokens * options.responsePercentage)
        this.client = anthropicOptions.client
        this.useInfillPrefix = anthropicOptions.mode === 'infill'
    }

    public emptyPromptLength(): number {
        const { messages } = this.useInfillPrefix ? this.createInfillPromptPrefix() : this.createPromptPrefix()
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
                text: `You are a code completion AI that writes high-quality code like a senior engineer. You are looking at ${
                    this.options.fileName
                }. You write code in between tags like this: ${OPENING_CODE_TAG}${
                    this.options.languageId === 'python' || this.options.languageId === 'ruby'
                        ? '# Code goes here'
                        : '/* Code goes here */'
                }${CLOSING_CODE_TAG}.`,
            },
            {
                speaker: 'assistant',
                text: 'I am a code completion AI that writes high-quality code like a senior engineer.',
            },
            {
                speaker: 'human',
                text: `Complete this code: ${OPENING_CODE_TAG}${head.trimmed}${CLOSING_CODE_TAG}.`,
            },
            {
                speaker: 'assistant',
                text: `Here is the code: ${OPENING_CODE_TAG}${tail.trimmed}`,
            },
        ]

        return { messages: prefixMessages, prefix: { head, tail, overlap } }
    }

    // NOTE: This revert pull/727 for this prompt branch that causes quality regressions
    // pull/727: https://github.com/sourcegraph/cody/pull/727
    private createInfillPromptPrefix(): { messages: Message[]; prefix: PrefixComponents } {
        const prefixLines = this.options.docContext.prefix.split('\n')
        if (prefixLines.length === 0) {
            throw new Error('no prefix lines')
        }

        const { head, tail, overlap } = getHeadAndTail(this.options.docContext.prefix)

        // Infill block represents the code we want the model to complete
        const infillBlock = tail.trimmed
        // code before the cursor, without the code extracted for the infillBlock
        const infillPrefix = head.raw
        // code after the cursor
        const infillSuffix = this.options.docContext.suffix

        const prefixMessagesWithInfill: Message[] = [
            {
                speaker: 'human',
                text: `You are a code completion AI designed to take the surrounding code and shared context into account in order to predict and suggest high-quality code to complete the code enclosed in ${OPENING_CODE_TAG} tags. You only response with code that works and fits seamlessly with surrounding code if any or use best practice and nothing else.`,
            },
            {
                speaker: 'assistant',
                text: 'I am a code completion AI with exceptional context-awareness designed to auto-complete nested code blocks with high-quality code that seamlessly integrates with surrounding code.',
            },
            {
                speaker: 'human',
                text: `Below is the code from file path ${this.options.fileName}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations.
                Here is the code: ${infillPrefix}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${infillSuffix}`,
            },
            {
                speaker: 'assistant',
                text: `${OPENING_CODE_TAG}${infillBlock}`,
            },
        ]

        return { messages: prefixMessagesWithInfill, prefix: { head, tail, overlap } }
    }

    // Creates the resulting prompt and adds as many snippets from the reference
    // list as possible.
    protected createPrompt(snippets: ContextSnippet[]): { messages: Message[]; prefix: PrefixComponents } {
        const { messages: prefixMessages, prefix } = this.useInfillPrefix
            ? this.createInfillPromptPrefix()
            : this.createPromptPrefix()

        const referenceSnippetMessages: Message[] = []

        let remainingChars = this.promptChars - this.emptyPromptLength()

        for (const snippet of snippets) {
            const snippetMessages: Message[] = [
                {
                    speaker: 'human',
                    text:
                        'symbol' in snippet && snippet.symbol !== ''
                            ? `Additional documentation for \`${snippet.symbol}\`${formatSymbolContextRelationship(
                                  snippet.sourceSymbolAndRelationship
                              )}: ${OPENING_CODE_TAG}${snippet.content}${CLOSING_CODE_TAG}`
                            : `Codebase context from file path '${snippet.fileName}': ${OPENING_CODE_TAG}${snippet.content}${CLOSING_CODE_TAG}`,
                },
                {
                    speaker: 'assistant',
                    text: 'I will refer to this code to complete your next request.',
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
                  stopSequences: MULTI_LINE_STOP_SEQUENCES,
              }
            : {
                  temperature: 0.5,
                  messages: prompt,
                  maxTokensToSample: Math.min(50, this.responseTokens),
                  stopSequences: SINGLE_LINE_STOP_SEQUENCES,
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
        model: anthropicOptions.mode === 'infill' ? 'claude-instant-infill' : 'claude-instant-1',
    }
}
