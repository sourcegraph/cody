import * as anthropic from '@anthropic-ai/sdk'
import * as vscode from 'vscode'

import { tokensToChars } from '@sourcegraph/cody-shared/src/prompt/constants'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { canUsePartialCompletion } from '../can-use-partial-completion'
import { CodeCompletionsClient, CodeCompletionsParams } from '../client'
import {
    CLOSING_CODE_TAG,
    extractFromCodeBlock,
    fixBadCompletionStart,
    getHeadAndTail,
    MULTILINE_STOP_SEQUENCE,
    OPENING_CODE_TAG,
    PrefixComponents,
    trimLeadingWhitespaceUntilNewline,
} from '../text-processing'
import { parseAndTruncateCompletion } from '../text-processing/parse-and-truncate-completion'
import { InlineCompletionItemWithAnalytics } from '../text-processing/process-inline-completions'
import { ContextSnippet } from '../types'
import { forkSignal, messagesToText } from '../utils'

import {
    CompletionProviderTracer,
    Provider,
    ProviderConfig,
    ProviderOptions,
    standardContextSizeHints,
} from './provider'

export const MULTI_LINE_STOP_SEQUENCES = [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG]
export const SINGLE_LINE_STOP_SEQUENCES = [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG, MULTILINE_STOP_SEQUENCE]

interface AnthropicOptions {
    maxContextTokens?: number
    client: Pick<CodeCompletionsClient, 'complete'>
    mode?: 'infill'
}

const MAX_RESPONSE_TOKENS = 256

export class AnthropicProvider extends Provider {
    private promptChars: number
    private client: Pick<CodeCompletionsClient, 'complete'>

    constructor(options: ProviderOptions, { maxContextTokens, client }: Required<AnthropicOptions>) {
        super(options)
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)

        this.client = client
    }

    public emptyPromptLength(): number {
        const { messages } = this.createPromptPrefix()
        const promptNoSnippets = messagesToText(messages)
        return promptNoSnippets.length - 10 // extra 10 chars of buffer cuz who knows
    }

    private createPromptPrefix(): { messages: Message[]; prefix: PrefixComponents } {
        const prefixLines = this.options.docContext.prefix.split('\n')
        if (prefixLines.length === 0) {
            throw new Error('no prefix lines')
        }

        const { head, tail, overlap } = getHeadAndTail(this.options.docContext.prefix)

        // Infill block represents the code we want the model to complete
        const infillBlock = `${tail.raw}`
        // code before the cursor, without the code extracted for the infillBlock
        const infillPrefix = head.raw?.startsWith(tail.trimmed) ? '' : `${head.raw}`
        // code after the cursor
        const infillSuffix = this.options.docContext.suffix
        const relativeFilePath = vscode.workspace.asRelativePath(this.options.document.fileName)

        const prefixMessagesWithInfill: Message[] = [
            {
                speaker: 'human',
                text: `Below is the code from file path ${relativeFilePath}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code enclosed in <completion_request> tags:\n<completion_request>${infillPrefix}${infillBlock}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${infillSuffix}</completion_request>`,
            },
            {
                speaker: 'assistant',
                text: `${OPENING_CODE_TAG}`,
            },
        ]

        return { messages: prefixMessagesWithInfill, prefix: { head, tail, overlap } }
    }

    // Creates the resulting prompt and adds as many snippets from the reference
    // list as possible.
    protected createPrompt(snippets: ContextSnippet[]): { messages: Message[]; prefix: PrefixComponents } {
        const { messages: prefixMessages, prefix } = this.createPromptPrefix()
        const introMessages: Message[] = [
            {
                speaker: 'human',
                text: `You are a code completion AI designed to take the surrounding code and shared context into account in order to predict and suggest high-quality code to complete the code enclosed in ${OPENING_CODE_TAG} tags. You only response with code that works and fits seamlessly with surrounding code if any or use best practice and nothing else.`,
            },
            {
                speaker: 'assistant',
                text: 'I am a code completion AI with exceptional context-awareness designed to auto-complete nested code blocks with high-quality code that seamlessly integrates with surrounding code.',
            },
        ]
        const referenceSnippetMessages: Message[] = [...introMessages]

        let remainingChars = this.promptChars - this.emptyPromptLength()

        for (const snippet of snippets) {
            const snippetMessages: Message[] = [
                {
                    speaker: 'human',
                    text:
                        'symbol' in snippet && snippet.symbol !== ''
                            ? `Documentation context for \`${snippet.symbol}\`: <shared_context>${snippet.content}</shared_context>`
                            : `File context from '${snippet.fileName}': <shared_context>${snippet.content}</shared_context>`,
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
    ): Promise<InlineCompletionItemWithAnalytics[]> {
        // Create prompt
        const { messages: prompt } = this.createPrompt(snippets)
        if (prompt.length > this.promptChars) {
            throw new Error(`prompt length (${prompt.length}) exceeded maximum character length (${this.promptChars})`)
        }

        const requestParams: CodeCompletionsParams = this.options.multiline
            ? {
                  temperature: 0.5,
                  messages: prompt,
                  maxTokensToSample: MAX_RESPONSE_TOKENS,
                  stopSequences: MULTI_LINE_STOP_SEQUENCES,
                  timeoutMs: 15000,
              }
            : {
                  temperature: 0.5,
                  messages: prompt,
                  maxTokensToSample: Math.min(50, MAX_RESPONSE_TOKENS),
                  stopSequences: SINGLE_LINE_STOP_SEQUENCES,
                  timeoutMs: 5000,
              }
        tracer?.params(requestParams)

        const completions = await Promise.all(
            Array.from({ length: this.options.n }).map(() => {
                return this.fetchAndProcessCompletions(this.client, requestParams, abortSignal)
            })
        )

        tracer?.result({ completions })
        return completions
    }

    private async fetchAndProcessCompletions(
        client: Pick<CodeCompletionsClient, 'complete'>,
        params: CodeCompletionsParams,
        abortSignal: AbortSignal
    ): Promise<InlineCompletionItemWithAnalytics> {
        // The Async executor is required to return the completion early if a partial result from SSE can be used.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            try {
                const abortController = forkSignal(abortSignal)

                const result = await client.complete(
                    params,
                    (incompleteResponse: CompletionResponse) => {
                        if (!this.options.disableStreamingTruncation) {
                            const processedCompletion = this.postProcess(incompleteResponse.completion)
                            const completion = canUsePartialCompletion(processedCompletion, this.options)

                            if (completion) {
                                resolve({ ...completion, stopReason: 'streaming-truncation' })
                                abortController.abort()
                            }
                        }
                    },
                    abortController.signal
                )

                const processedCompletion = this.postProcess(result.completion)
                const completion = parseAndTruncateCompletion(processedCompletion, this.options)

                resolve({ ...completion, stopReason: result.stopReason })
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

export function createProviderConfig({
    maxContextTokens = 2048,
    mode = 'infill',
    ...otherOptions
}: AnthropicOptions): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new AnthropicProvider(options, { maxContextTokens, mode, ...otherOptions })
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        enableExtendedMultilineTriggers: true,
        identifier: 'anthropic',
        model: 'claude-instant-infill',
    }
}
