import * as anthropic from '@anthropic-ai/sdk'
import * as vscode from 'vscode'

import { tokensToChars } from '@sourcegraph/cody-shared/src/prompt/constants'
import { type Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { type CodeCompletionsClient, type CodeCompletionsParams } from '../client'
import { type DocumentContext } from '../get-current-doc-context'
import {
    CLOSING_CODE_TAG,
    extractFromCodeBlock,
    fixBadCompletionStart,
    getHeadAndTail,
    MULTILINE_STOP_SEQUENCE,
    OPENING_CODE_TAG,
    trimLeadingWhitespaceUntilNewline,
    type PrefixComponents,
} from '../text-processing'
import { type InlineCompletionItemWithAnalytics } from '../text-processing/process-inline-completions'
import { type ContextSnippet } from '../types'
import { messagesToText } from '../utils'

import {
    generateCompletions,
    getCompletionParamsAndFetchImpl,
    getLineNumberDependentCompletionParams,
} from './generate-completions'
import {
    Provider,
    standardContextSizeHints,
    type CompletionProviderTracer,
    type ProviderConfig,
    type ProviderOptions,
} from './provider'

const MAX_RESPONSE_TOKENS = 256

export const SINGLE_LINE_STOP_SEQUENCES = [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG, MULTILINE_STOP_SEQUENCE]
export const MULTI_LINE_STOP_SEQUENCES = [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG]

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopRequences: SINGLE_LINE_STOP_SEQUENCES,
    multilineStopSequences: MULTI_LINE_STOP_SEQUENCES,
})

interface AnthropicOptions {
    maxContextTokens?: number
    client: Pick<CodeCompletionsClient, 'complete'>
}

class AnthropicProvider extends Provider {
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
        const infillBlock = tail.trimmed.endsWith('{\n') ? tail.trimmed.trimEnd() : tail.trimmed
        // code before the cursor, without the code extracted for the infillBlock
        const infillPrefix = head.raw
        // code after the cursor
        const infillSuffix = this.options.docContext.suffix
        const relativeFilePath = vscode.workspace.asRelativePath(this.options.document.fileName)

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
                text: `Below is the code from file path ${relativeFilePath}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code: \n\`\`\`\n${infillPrefix}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${infillSuffix}\n\`\`\``,
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
        const { messages: prefixMessages, prefix } = this.createPromptPrefix()

        const referenceSnippetMessages: Message[] = []

        let remainingChars = this.promptChars - this.emptyPromptLength()

        for (const snippet of snippets) {
            const snippetMessages: Message[] = [
                {
                    speaker: 'human',
                    text:
                        'symbol' in snippet && snippet.symbol !== ''
                            ? `Additional documentation for \`${snippet.symbol}\`: ${OPENING_CODE_TAG}${snippet.content}${CLOSING_CODE_TAG}`
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
        onCompletionReady: (completion: InlineCompletionItemWithAnalytics[]) => void,
        onHotStreakCompletionReady: (
            docContext: DocumentContext,
            completion: InlineCompletionItemWithAnalytics
        ) => void,
        tracer?: CompletionProviderTracer
    ): Promise<void> {
        const { partialRequestParams, fetchAndProcessCompletionsImpl } = getCompletionParamsAndFetchImpl({
            providerOptions: this.options,
            lineNumberDependentCompletionParams,
        })

        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: this.createPrompt(snippets).messages,
            temperature: 0.5,
        }

        await generateCompletions({
            client: this.client,
            requestParams,
            abortSignal,
            providerSpecificPostProcess: this.postProcess,
            providerOptions: this.options,
            tracer,
            fetchAndProcessCompletionsImpl,
            onCompletionReady,
            onHotStreakCompletionReady,
        })
    }

    private postProcess = (rawResponse: string): string => {
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

export function createProviderConfig({ maxContextTokens = 2048, ...otherOptions }: AnthropicOptions): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new AnthropicProvider(options, { maxContextTokens, ...otherOptions })
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        identifier: 'anthropic',
        model: 'claude-instant-1.2',
    }
}
