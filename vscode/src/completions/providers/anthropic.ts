import * as anthropic from '@anthropic-ai/sdk'
import * as vscode from 'vscode'

import {
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type Message,
    displayPath,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import {
    CLOSING_CODE_TAG,
    MULTILINE_STOP_SEQUENCE,
    OPENING_CODE_TAG,
    type PrefixComponents,
    extractFromCodeBlock,
    fixBadCompletionStart,
    getHeadAndTail,
    trimLeadingWhitespaceUntilNewline,
} from '../text-processing'
import type { ContextSnippet } from '../types'
import {
    forkSignal,
    generatorWithErrorObserver,
    generatorWithTimeout,
    messagesToText,
    zipGenerators,
} from '../utils'

import type { FetchCompletionResult } from './fetch-and-process-completions'
import {
    getCompletionParamsAndFetchImpl,
    getLineNumberDependentCompletionParams,
} from './get-completion-params'
import {
    type CompletionProviderTracer,
    Provider,
    type ProviderConfig,
    type ProviderOptions,
    standardContextSizeHints,
} from './provider'

const MAX_RESPONSE_TOKENS = 256

export const SINGLE_LINE_STOP_SEQUENCES = [
    anthropic.HUMAN_PROMPT,
    CLOSING_CODE_TAG,
    MULTILINE_STOP_SEQUENCE,
]
export const MULTI_LINE_STOP_SEQUENCES = [anthropic.HUMAN_PROMPT, CLOSING_CODE_TAG]

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: SINGLE_LINE_STOP_SEQUENCES,
    multilineStopSequences: MULTI_LINE_STOP_SEQUENCES,
})

let isOutdatedSourcegraphInstanceWithoutAnthropicAllowlist = false

interface AnthropicOptions {
    model?: string // The model identifier that is being used by the server's site config.
    maxContextTokens?: number
    client: Pick<CodeCompletionsClient, 'complete'>
}

class AnthropicProvider extends Provider {
    private promptChars: number
    private client: Pick<CodeCompletionsClient, 'complete'>
    private model: string | undefined

    constructor(
        options: ProviderOptions,
        {
            maxContextTokens,
            client,
            model,
        }: Required<Omit<AnthropicOptions, 'model'>> & Pick<AnthropicOptions, 'model'>
    ) {
        super(options)
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.client = client
        this.model = model
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
    protected createPrompt(snippets: ContextSnippet[]): {
        messages: Message[]
        prefix: PrefixComponents
    } {
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
                            : `Codebase context from file path '${displayPath(
                                  snippet.uri
                              )}': ${OPENING_CODE_TAG}${snippet.content}${CLOSING_CODE_TAG}`,
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

    public generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        const { partialRequestParams, fetchAndProcessCompletionsImpl } = getCompletionParamsAndFetchImpl(
            {
                providerOptions: this.options,
                lineNumberDependentCompletionParams,
            }
        )

        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: this.createPrompt(snippets).messages,
            temperature: 0.5,

            // Pass forward the unmodified model identifier that is set in the server's site
            // config. This allows us to keep working even if the site config was updated since
            // we read the config value.
            //
            // Note: This behavior only works when Cody Gateway is used (as that's the only backend
            //       that supports switching between providers at the same time). We also only allow
            //       models that are allowlisted on a recent SG server build to avoid regressions.
            model:
                !isOutdatedSourcegraphInstanceWithoutAnthropicAllowlist && isAllowlistedModel(this.model)
                    ? this.model
                    : undefined,
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: this.options.n }).map(() => {
            const abortController = forkSignal(abortSignal)

            const completionResponseGenerator = generatorWithErrorObserver(
                generatorWithTimeout(
                    this.client.complete(requestParams, abortController),
                    requestParams.timeoutMs,
                    abortController
                ),
                error => {
                    if (error instanceof Error) {
                        // If an "unsupported code completion model" error is thrown for Anthropic,
                        // it's most likely because we started adding the `model` identifier to
                        // requests to ensure the clients does not crash when the default site
                        // config value changes.
                        //
                        // Older instances do not allow for the `model` to be set, even to
                        // identifiers it supports and thus the error.
                        //
                        // If it happens once, we disable the behavior where the client includes a
                        // `model` parameter.
                        if (
                            error.message.includes('Unsupported code completion model') ||
                            error.message.includes('Unsupported chat model') ||
                            error.message.includes('Unsupported custom model')
                        ) {
                            isOutdatedSourcegraphInstanceWithoutAnthropicAllowlist = true
                        }
                    }
                }
            )

            return fetchAndProcessCompletionsImpl({
                completionResponseGenerator,
                abortController,
                providerSpecificPostProcess: this.postProcess,
                providerOptions: this.options,
            })
        })

        return zipGenerators(completionsGenerators)
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

const PROVIDER_IDENTIFIER = 'anthropic'

export function createProviderConfig({
    maxContextTokens = 2048,
    model,
    /**
     * Expose provider options here too to set the from the integration tests.
     * TODO(valery): simplify this API and remove the need to expose it only for tests.
     */
    providerOptions,
    ...otherOptions
}: AnthropicOptions & { providerOptions?: Partial<ProviderOptions> }): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new AnthropicProvider(
                {
                    ...options,
                    ...providerOptions,
                    id: PROVIDER_IDENTIFIER,
                },
                { maxContextTokens, model, ...otherOptions }
            )
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        identifier: PROVIDER_IDENTIFIER,
        model: model ?? 'claude-instant-1.2',
    }
}

// All the Anthropic version identifiers that are allowlisted as being able to be passed as the
// model identifier on a Sourcegraph Server
function isAllowlistedModel(model: string | undefined): boolean {
    switch (model) {
        case 'anthropic/claude-instant-1.2-cyan':
        case 'anthropic/claude-instant-1.2':
        case 'anthropic/claude-instant-v1':
        case 'anthropic/claude-instant-1':
            return true
    }
    return false
}
