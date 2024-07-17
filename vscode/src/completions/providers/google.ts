import {
    type AutocompleteContextSnippet,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type Message,
    PromptString,
    ps,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import { type PrefixComponents, fixBadCompletionStart, getHeadAndTail } from '../text-processing'
import { forkSignal, generatorWithTimeout, messagesToText, zipGenerators } from '../utils'

import {
    type FetchCompletionResult,
    fetchAndProcessDynamicMultilineCompletions,
} from './fetch-and-process-completions'
import {
    MAX_RESPONSE_TOKENS,
    getCompletionParams,
    getLineNumberDependentCompletionParams,
} from './get-completion-params'
import {
    type CompletionProviderTracer,
    Provider,
    type ProviderConfig,
    type ProviderOptions,
    standardContextSizeHints,
} from './provider'

const DEFAULT_GEMINI_MODEL = 'google/gemini-1.5-flash'
const SUPPORTED_GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-pro', 'gemini-1.0-pro']

const MARKERS = {
    Prefix: ps`<|prefix|>`,
    Suffix: ps`<|suffix|>`,
    Response: ps`<|fim|>`,
}

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: [`${MARKERS.Response}`],
    multilineStopSequences: [`${MARKERS.Response}`],
})

interface GoogleGeminiOptions {
    model?: string
    maxContextTokens?: number
    client: Pick<CodeCompletionsClient, 'complete'>
}

const PROVIDER_IDENTIFIER = 'google'

class GoogleGeminiProvider extends Provider {
    private model: string

    private client: Pick<CodeCompletionsClient, 'complete'>

    private promptChars: number

    constructor(
        options: ProviderOptions,
        { maxContextTokens, client, model }: Required<GoogleGeminiOptions>
    ) {
        super(options)
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.model = model
        this.client = client
    }

    public emptyPromptLength(): number {
        const { messages } = this.createPrompt([])
        const promptNoSnippets = messagesToText(messages)
        return promptNoSnippets.length - 10
    }

    protected createPrompt(snippets: AutocompleteContextSnippet[]): {
        messages: Message[]
        prefix: PrefixComponents
    } {
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
            this.options.docContext,
            this.options.document.uri
        )

        const { head, tail, overlap } = getHeadAndTail(prefix)

        const relativeFilePath = PromptString.fromDisplayPath(this.options.document.uri)

        let groupedSnippets = ps``

        for (const snippet of snippets) {
            const { uri } = snippet
            const { content, symbol } = PromptString.fromAutocompleteContextSnippet(snippet)
            const contextPrompt = this.createContext(
                symbol ? ps`symbol` : ps`file`,
                symbol ? symbol : PromptString.fromDisplayPath(uri),
                content
            )

            if (
                contextPrompt.length + 1 > this.promptChars - this.emptyPromptLength() ||
                !contextPrompt.length
            ) {
                break
            }

            groupedSnippets = groupedSnippets.concat(contextPrompt)
        }

        if (groupedSnippets.length) {
            groupedSnippets = ps`Context:\n${groupedSnippets}\n`
        }

        // See official docs on prompting for Gemini models:
        // https://ai.google.dev/gemini-api/docs/prompting-intro
        const fimPrompt = ps`${MARKERS.Prefix}${prefix}${MARKERS.Response}${suffix}${MARKERS.Suffix}`

        const humanText = ps`You are a code completion AI, designed to autofill code enclosed in special markers based on its surrounding context.
${groupedSnippets}

Code from ${relativeFilePath} file:
${fimPrompt}

Your mission is to generate completed code that I can replace the ${MARKERS.Response} markers with, ensuring a seamless and syntactically correct result.

Do not repeat code from before and after ${MARKERS.Response} in your output.
Maintain consistency with the indentation, spacing, and coding style used in the code.
Leave the output markers empty if no code is required to bridge the gap.
Your response should contains only the code required to connect the gap, and the code must be enclosed between ${MARKERS.Response} WITHOUT backticks`

        const messages: Message[] = [
            { speaker: 'human', text: humanText },
            { speaker: 'assistant', text: ps`${MARKERS.Response}` },
        ]

        return { messages, prefix: { head, tail, overlap } }
    }

    public generateCompletions(
        abortSignal: AbortSignal,
        snippets: AutocompleteContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        const partialRequestParams = getCompletionParams({
            providerOptions: this.options,
            lineNumberDependentCompletionParams,
        })

        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: this.createPrompt(snippets).messages,
            topP: 0.95,
            temperature: 0,
            model: this.model,
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: this.options.n }).map(() => {
            const abortController = forkSignal(abortSignal)

            const completionResponseGenerator = generatorWithTimeout(
                this.client.complete(requestParams, abortController),
                requestParams.timeoutMs,
                abortController
            )

            return fetchAndProcessDynamicMultilineCompletions({
                completionResponseGenerator,
                abortController,
                providerSpecificPostProcess: this.postProcess,
                providerOptions: this.options,
            })
        })

        return zipGenerators(completionsGenerators)
    }

    private postProcess = (rawResponse: string): string => {
        let completion = rawResponse

        // Because the response should be enclosed with RESPONSE_CODE for consistency.
        completion = completion.replaceAll(`${MARKERS.Response}`, '').replaceAll(`${MARKERS.Suffix}`, '')

        // Remove bad symbols from the start of the completion string.
        completion = fixBadCompletionStart(completion)

        return completion
    }

    private createContext(type: PromptString, name: PromptString, content: PromptString) {
        return ps`\n-TYPE: ${type}\n-NAME: ${name}\n-CONTENT: ${content.trimEnd()}\n---\n`
    }
}

export function createProviderConfig({
    model,
    maxContextTokens = 2048,
    ...otherOptions
}: GoogleGeminiOptions & { model?: string }): ProviderConfig {
    if (!model) {
        model = DEFAULT_GEMINI_MODEL
    }

    if (!SUPPORTED_GEMINI_MODELS.some(m => model.includes(m))) {
        throw new Error(`Model ${model} is not supported by GeminiProvider`)
    }

    return {
        create(options: ProviderOptions) {
            return new GoogleGeminiProvider(
                {
                    ...options,
                    id: PROVIDER_IDENTIFIER,
                },
                {
                    maxContextTokens,
                    ...otherOptions,
                    model,
                }
            )
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        identifier: PROVIDER_IDENTIFIER,
        model,
    }
}
