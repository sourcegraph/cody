import * as anthropic from '@anthropic-ai/sdk'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import { CompletionParameters } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { ReferenceSnippet } from '../context'
import {
    CLOSING_CODE_TAG,
    extractFromCodeBlock,
    fixBadCompletionStart,
    getHeadAndTail,
    OPENING_CODE_TAG,
    PrefixComponents,
    trimLeadingWhitespaceUntilNewline,
} from '../text-processing'
import { Completion } from '../types'
import { batchCompletions, messagesToText } from '../utils'

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
        const prefixLines = this.options.prefix.split('\n')
        if (prefixLines.length === 0) {
            throw new Error('no prefix lines')
        }

        const { head, tail, overlap } = getHeadAndTail(this.options.prefix)
        const prefixMessages: Message[] = [
            {
                speaker: 'human',
                text: `You are a code completion AI that writes high-quality code like a senior engineer. You are looking at ${this.options.fileName}. You write code in between tags like this: ${OPENING_CODE_TAG}/* Code goes here */${CLOSING_CODE_TAG}.`,
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

    // Creates the resulting prompt and adds as many snippets from the reference
    // list as possible.
    protected createPrompt(snippets: ReferenceSnippet[]): { messages: Message[]; prefix: PrefixComponents } {
        const { messages: prefixMessages, prefix } = this.createPromptPrefix()

        const referenceSnippetMessages: Message[] = []

        let remainingChars = this.promptChars - this.emptyPromptLength()

        for (const snippet of snippets) {
            const snippetMessages: Message[] = [
                {
                    speaker: 'human',
                    text: `Here is a reference snippet of code: ${OPENING_CODE_TAG}${snippet.content}${CLOSING_CODE_TAG}`,
                },
                {
                    speaker: 'assistant',
                    text: 'I have added the snippet to my knowledge base.',
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

    private postProcess(rawResponse: string): string {
        let completion = extractFromCodeBlock(rawResponse)

        const trimmedPrefixContainNewline = this.options.prefix
            .slice(this.options.prefix.trimEnd().length)
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

        // Only keep a single line in single-line completions mode
        if (!this.options.multiline) {
            const lines = completion.split('\n')
            completion = lines[0]
        }

        // Trim start and end of the completion to remove all trailing whitespace.
        return completion.trimEnd()
    }

    public async generateCompletions(
        abortSignal: AbortSignal,
        snippets: ReferenceSnippet[],
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
        const responses = await batchCompletions(this.completionsClient, args, this.options.n, abortSignal)

        // Post-process
        const ret = responses.map(resp => {
            const content = this.postProcess(resp.completion)

            if (content === null) {
                return []
            }

            return [
                {
                    prefix: this.options.prefix,
                    content,
                    stopReason: resp.stopReason,
                },
            ]
        })

        const completions = ret.flat()
        tracer?.result({ rawResponses: responses, completions })

        return completions
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
