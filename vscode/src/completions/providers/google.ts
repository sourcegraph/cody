import {
    type AutocompleteContextSnippet,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type Message,
    PromptString,
    ps,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import {
    MULTILINE_STOP_SEQUENCE,
    type PrefixComponents,
    fixBadCompletionStart,
    getHeadAndTail,
} from '../text-processing'
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

const AT_CURSOR = '<|fim_middle|>'

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: [MULTILINE_STOP_SEQUENCE, AT_CURSOR],
    multilineStopSequences: [MULTILINE_STOP_SEQUENCE, AT_CURSOR],
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

    private instructions =
        ps`You are a code completion AI designed to autofill code at the <|fim_middle|> location based on its surrounding context.`

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
        return promptNoSnippets.length - 10 // extra 10 chars of buffer cuz who knows
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

        function createContext(type: PromptString, name: PromptString, content: PromptString) {
            return ps`\nTYPE: ${type}\nNAME: ${name}\nCONTENT: ${content.trimEnd()}\n---\n`
        }

        for (const snippet of snippets) {
            const { uri } = snippet
            const { content, symbol } = PromptString.fromAutocompleteContextSnippet(snippet)
            const contextPrompt = createContext(
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
            groupedSnippets = ps`CONTEXT:\n${groupedSnippets}\n---\n`
        }

        const infillPrompt = ps`<|fim_start|>${prefix}<|fim_middle|>${suffix}<|fim_end|>`

        const humanText = ps`${this.instructions}\n---${groupedSnippets}\n\nTASK:\nFILE: ${relativeFilePath}\nRULE: Enclose your response with <|fim_middle|> without backticks and nothing else.\nEnsure to follow its surrounding coding styles, format, and spacings without repeating.\nCODE:\n${infillPrompt}\n---`

        const messages: Message[] = [
            { speaker: 'human', text: humanText.replace('{context}', ps`\n${groupedSnippets}\n`) },
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
            topP: 0.5,
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
        let completion = rawResponse.trim()

        // We asked the model to enclose their response with AT_CURSOR & FILE_SEPARATOR for consistency,
        // so we will remove them here.
        completion = completion.replace(AT_CURSOR, '')

        // Remove bad symbols from the start of the completion string.
        completion = fixBadCompletionStart(completion)

        return completion
    }
}

export function createProviderConfig({
    model,
    maxContextTokens = 2048,
    ...otherOptions
}: GoogleGeminiOptions & { model?: string }): ProviderConfig {
    if (!model) {
        model = 'google/gemini-1.5-flash'
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
