import {
    type AutocompleteContextSnippet,
    type CodeCompletionsParams,
    type DocumentContext,
    PromptString,
    ps,
} from '@sourcegraph/cody-shared'

import {
    CLOSING_CODE_TAG,
    MULTILINE_STOP_SEQUENCE,
    OPENING_CODE_TAG,
    extractFromCodeBlock,
    fixBadCompletionStart,
    getHeadAndTail,
    trimLeadingWhitespaceUntilNewline,
} from '../text-processing'
import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

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

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: [CLOSING_CODE_TAG.toString(), MULTILINE_STOP_SEQUENCE],
    multilineStopSequences: [CLOSING_CODE_TAG.toString(), MULTILINE_STOP_SEQUENCE],
})

class UnstableOpenAIProvider extends Provider {
    private instructions =
        ps`You are a code completion AI designed to take the surrounding code and shared context into account in order to predict and suggest high-quality code to complete the code enclosed in ${OPENING_CODE_TAG} tags.  You only respond with code that works and fits seamlessly with surrounding code. Do not include anything else beyond the code.`

    public emptyPromptLength(options: GenerateCompletionsOptions): number {
        const promptNoSnippets = [this.instructions, this.createPromptPrefix(options)].join('\n\n')
        return promptNoSnippets.length - 10 // extra 10 chars of buffer cuz who knows
    }

    private createPromptPrefix(options: GenerateCompletionsOptions): PromptString {
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
            options.docContext,
            options.document.uri
        )

        const prefixLines = prefix.toString().split('\n')
        if (prefixLines.length === 0) {
            throw new Error('no prefix lines')
        }

        const { head, tail } = getHeadAndTail(prefix)

        // Infill block represents the code we want the model to complete
        const infillBlock = tail.trimmed.toString().endsWith('{\n')
            ? tail.trimmed.trimEnd()
            : tail.trimmed
        // code before the cursor, without the code extracted for the infillBlock
        const infillPrefix = head.raw
        // code after the cursor
        const infillSuffix = suffix
        const relativeFilePath = PromptString.fromDisplayPath(options.document.uri)

        return ps`Below is the code from file path ${relativeFilePath}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:\n\`\`\`\n${
            infillPrefix ? infillPrefix : ''
        }${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${infillSuffix}\n\`\`\`

${OPENING_CODE_TAG}${infillBlock}`
    }

    // Creates the resulting prompt and adds as many snippets from the reference
    // list as possible.
    protected createPrompt(
        options: GenerateCompletionsOptions,
        snippets: AutocompleteContextSnippet[]
    ): PromptString {
        const prefix = this.createPromptPrefix(options)

        const referenceSnippetMessages: PromptString[] = []
        let remainingChars = this.promptChars - this.emptyPromptLength(options)

        for (const snippet of snippets) {
            const contextPrompts = PromptString.fromAutocompleteContextSnippet(snippet)

            const snippetMessages: PromptString[] = [
                contextPrompts.symbol?.toString() !== ''
                    ? ps`Additional documentation for \`${
                          contextPrompts.symbol ?? ps``
                      }\`: ${OPENING_CODE_TAG}${contextPrompts.content}${CLOSING_CODE_TAG}`
                    : ps`Codebase context from file path '${PromptString.fromDisplayPath(
                          snippet.uri
                      )}': ${OPENING_CODE_TAG}${contextPrompts.content}${CLOSING_CODE_TAG}`,
            ]
            const numSnippetChars = snippetMessages.join('\n\n').length + 1
            if (numSnippetChars > remainingChars) {
                break
            }
            referenceSnippetMessages.push(...snippetMessages)
            remainingChars -= numSnippetChars
        }

        const messages = [this.instructions, ...referenceSnippetMessages, prefix]
        return PromptString.join(messages, ps`\n\n`)
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
            messages: [{ speaker: 'human', text: this.createPrompt(options, snippets) }],
            topP: 0.5,
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({
            length: options.numberOfCompletionsToGenerate,
        }).map(() => {
            const abortController = forkSignal(abortSignal)

            const completionResponseGenerator = generatorWithTimeout(
                this.client.complete(requestParams, abortController),
                requestParams.timeoutMs,
                abortController
            )

            return fetchAndProcessDynamicMultilineCompletions({
                completionResponseGenerator,
                abortController,
                providerSpecificPostProcess: this.postProcess(docContext),
                generateOptions: options,
            })
        })

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
                // The prefix already contains a `\n` that LLM was not aware of, so we remove any
                // leading `\n` followed by whitespace that might be add.
                completion = completion.replace(/^\s*\n\s*/, '')
            } else {
                completion = trimLeadingWhitespaceUntilNewline(completion)
            }

            // Remove bad symbols from the start of the completion string.
            completion = fixBadCompletionStart(completion)

            return completion
        }
}

export function createProvider(params: ProviderFactoryParams): Provider {
    const { legacyModel, provider, anonymousUserID, source } = params

    let clientModel = legacyModel

    if (provider === 'azure-openai' && legacyModel) {
        // Model name for azure openai provider is a deployment name. It shouldn't appear in logs.
        clientModel = ''
    }

    if (provider === 'unstable-openai') {
        // Model is ignored for `unstable-openai` provider
        clientModel = undefined
    }

    return new UnstableOpenAIProvider({
        id: 'unstable-openai',
        legacyModel: clientModel ?? 'gpt-35-turbo',
        anonymousUserID,
        source,
    })
}
