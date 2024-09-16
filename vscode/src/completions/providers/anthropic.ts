import * as anthropic from '@anthropic-ai/sdk'

import {
    type AutocompleteContextSnippet,
    type CodeCompletionsParams,
    type DocumentContext,
    type Message,
    PromptString,
    currentAuthStatusAuthed,
    isDotComAuthed,
    ps,
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
import {
    forkSignal,
    generatorWithErrorObserver,
    generatorWithTimeout,
    messagesToText,
    zipGenerators,
} from '../utils'

import {
    type FetchCompletionResult,
    fetchAndProcessDynamicMultilineCompletions,
} from './fetch-and-process-completions'
import { getCompletionParams, getLineNumberDependentCompletionParams } from './get-completion-params'
import {
    type CompletionProviderTracer,
    type GenerateCompletionsOptions,
    Provider,
    type ProviderFactoryParams,
} from './provider'

export const SINGLE_LINE_STOP_SEQUENCES = [
    anthropic.HUMAN_PROMPT,
    CLOSING_CODE_TAG.toString(),
    MULTILINE_STOP_SEQUENCE,
]

export const MULTI_LINE_STOP_SEQUENCES = [
    anthropic.HUMAN_PROMPT,
    CLOSING_CODE_TAG.toString(),
    MULTILINE_STOP_SEQUENCE,
]

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: SINGLE_LINE_STOP_SEQUENCES,
    multilineStopSequences: MULTI_LINE_STOP_SEQUENCES,
})

let isOutdatedSourcegraphInstanceWithoutAnthropicAllowlist = false

class AnthropicProvider extends Provider {
    public emptyPromptLength(options: GenerateCompletionsOptions): number {
        const { messages } = this.createPromptPrefix(options)
        const promptNoSnippets = messagesToText(messages)
        return promptNoSnippets.length - 10 // extra 10 chars of buffer cuz who knows
    }

    private createPromptPrefix(options: GenerateCompletionsOptions): {
        messages: Message[]
        prefix: PrefixComponents
    } {
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
            options.docContext,
            options.document.uri
        )

        const prefixLines = prefix.split('\n')
        if (prefixLines.length === 0) {
            throw new Error('no prefix lines')
        }

        const { head, tail, overlap } = getHeadAndTail(prefix)

        // Infill block represents the code we want the model to complete
        const infillBlock = tail.trimmed.toString().endsWith('{\n')
            ? tail.trimmed.trimEnd()
            : tail.trimmed
        // code before the cursor, without the code extracted for the infillBlock
        const infillPrefix = head.raw
        // code after the cursor
        const infillSuffix = suffix
        const relativeFilePath = PromptString.fromDisplayPath(options.document.uri)

        const prefixMessagesWithInfill: Message[] = [
            {
                speaker: 'human',
                text: ps`You are a code completion AI designed to take the surrounding code and shared context into account in order to predict and suggest high-quality code to complete the code enclosed in ${OPENING_CODE_TAG} tags. You only respond with code that works and fits seamlessly with surrounding code if any or use best practice and nothing else.`,
            },
            {
                speaker: 'assistant',
                text: ps`I am a code completion AI with exceptional context-awareness designed to auto-complete nested code blocks with high-quality code that seamlessly integrates with surrounding code.`,
            },
            {
                speaker: 'human',
                text: ps`Below is the code from file path ${relativeFilePath}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code: \n\`\`\`\n${
                    infillPrefix ? infillPrefix : ''
                }${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${infillSuffix}\n\`\`\``,
            },
            {
                speaker: 'assistant',
                text: ps`${OPENING_CODE_TAG}${infillBlock}`,
            },
        ]

        return { messages: prefixMessagesWithInfill, prefix: { head, tail, overlap } }
    }

    // Creates the resulting prompt and adds as many snippets from the reference
    // list as possible.
    protected createPrompt(
        options: GenerateCompletionsOptions,
        snippets: AutocompleteContextSnippet[]
    ): {
        messages: Message[]
        prefix: PrefixComponents
    } {
        const { messages: prefixMessages, prefix } = this.createPromptPrefix(options)

        const referenceSnippetMessages: Message[] = []

        let remainingChars = this.promptChars - this.emptyPromptLength(options)

        for (const snippet of snippets) {
            const contextPrompts = PromptString.fromAutocompleteContextSnippet(snippet)

            const snippetMessages: Message[] = [
                {
                    speaker: 'human',
                    text: contextPrompts.symbol
                        ? ps`Additional documentation for \`${contextPrompts.symbol}\`: ${OPENING_CODE_TAG}${contextPrompts.content}${CLOSING_CODE_TAG}`
                        : ps`Codebase context from file path '${PromptString.fromDisplayPath(
                              snippet.uri
                          )}': ${OPENING_CODE_TAG}${contextPrompts.content}${CLOSING_CODE_TAG}`,
                },
                {
                    speaker: 'assistant',
                    text: ps`I will refer to this code to complete your next request.`,
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
        options: GenerateCompletionsOptions,
        abortSignal: AbortSignal,
        snippets: AutocompleteContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        const partialRequestParams = getCompletionParams({
            providerOptions: options,
            lineNumberDependentCompletionParams,
        })

        const { docContext } = options

        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: this.createPrompt(options, snippets).messages,
            temperature: 0.5,

            // Pass forward the unmodified model identifier that is set in the server's site
            // config. This allows us to keep working even if the site config was updated since
            // we read the config value.
            //
            // Note: This behavior only works when Cody Gateway is used (as that's the only backend
            //       that supports switching between providers at the same time). We also only allow
            //       models that are allowlisted on a recent SG server build to avoid regressions.
            model:
                !isOutdatedSourcegraphInstanceWithoutAnthropicAllowlist &&
                isAllowlistedModel(this.legacyModel)
                    ? this.legacyModel
                    : undefined,
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: options.numberOfCompletionsToGenerate }).map(
            () => {
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

                return fetchAndProcessDynamicMultilineCompletions({
                    completionResponseGenerator,
                    abortController,
                    providerSpecificPostProcess: this.postProcess(docContext),
                    generateOptions: options,
                })
            }
        )

        return zipGenerators(completionsGenerators)
    }

    private postProcess =
        (docContext: DocumentContext) =>
        (rawResponse: string): string => {
            let completion = extractFromCodeBlock(rawResponse)

            const trimmedPrefixContainNewline = docContext.prefix
                .slice(docContext.prefix.trimEnd().length)
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

function getClientModel(provider: string): string {
    // Always use the default PLG model on DotCom
    if (isDotComAuthed()) {
        return DEFAULT_PLG_ANTHROPIC_MODEL
    }

    if (provider === 'google') {
        // Model name for google provider is a deployment name. It shouldn't appear in logs.
        return ''
    }

    const { configOverwrites } = currentAuthStatusAuthed()

    // Only pass through the upstream-defined model if we're using Cody Gateway
    if (configOverwrites?.provider === 'sourcegraph') {
        return configOverwrites.completionModel || ''
    }

    return ''
}

export function createProvider(params: ProviderFactoryParams): Provider {
    const { provider, anonymousUserID, source } = params

    return new AnthropicProvider({
        id: 'anthropic',
        legacyModel: getClientModel(provider),
        anonymousUserID,
        source,
    })
}

export const DEFAULT_PLG_ANTHROPIC_MODEL = 'anthropic/claude-instant-1.2'

// All the Anthropic version identifiers that are allowlisted as being able to be passed as the
// model identifier on a Sourcegraph Server
// TODO: drop this in a follow up PR
function isAllowlistedModel(model: string | undefined): boolean {
    switch (model) {
        case 'anthropic/claude-instant-1.2-cyan':
        case 'anthropic/claude-instant-1.2':
        case 'anthropic/claude-instant-v1':
        case 'anthropic/claude-instant-1':
        case 'anthropic/claude-3-haiku-20240307':
            return true
    }
    return false
}
