import {
    type AutocompleteContextSnippet,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    PromptString,
    ps,
    tokensToChars,
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

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: [CLOSING_CODE_TAG.toString(), MULTILINE_STOP_SEQUENCE],
    multilineStopSequences: [CLOSING_CODE_TAG.toString(), MULTILINE_STOP_SEQUENCE],
})

interface UnstableOpenAIOptions {
    maxContextTokens?: number
    client: Pick<CodeCompletionsClient, 'complete'>
}

const PROVIDER_IDENTIFIER = 'unstable-openai'

class UnstableOpenAIProvider extends Provider {
    private client: Pick<CodeCompletionsClient, 'complete'>
    private promptChars: number
    private instructions =
        ps`You are a code completion AI designed to take the surrounding code and shared context into account in order to predict and suggest high-quality code to complete the code enclosed in ${OPENING_CODE_TAG} tags.  You only respond with code that works and fits seamlessly with surrounding code. Do not include anything else beyond the code.`

    constructor(
        options: ProviderOptions,
        { maxContextTokens, client }: Required<UnstableOpenAIOptions>
    ) {
        super(options)
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.client = client
    }

    public emptyPromptLength(): number {
        const promptNoSnippets = [this.createPromptPrefix()].join('\n\n')
        return promptNoSnippets.length - 10 // extra 10 chars of buffer cuz who knows
    }

    private createPromptPrefix(): PromptString {
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
            this.options.docContext,
            this.options.document.uri
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
        const relativeFilePath = PromptString.fromDisplayPath(this.options.document.uri)

        return ps`<existing_code>
              ${prefix}{{cursor}}${suffix}
            </existing_code>
`
    }

    // Creates the resulting prompt and adds as many snippets from the reference
    // list as possible.
    protected createPrompt(snippets: AutocompleteContextSnippet[]): PromptString {
        const prefix = this.createPromptPrefix()

        const referenceSnippetMessages: PromptString[] = []

        let remainingChars = this.promptChars - this.emptyPromptLength()

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

        const messages = [...referenceSnippetMessages, prefix]
        return PromptString.join(messages, ps`\n\n`)
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

        const { uri } = this.options.document
        const relativeFilePath = PromptString.fromDisplayPath(uri)
        const languageId = PromptString.fromMarkdownCodeBlockLanguageIDForFilename(uri)

        const examplesArray = [
            {
                example: ps`\n      function calculateArea(radius: number): number {\n        return Math.PI * radius * radius;\n      }\n\n      function calculateCircumference(radius: number): number {\n        {{cursor}}\n      }\n    `,
                response: ps`\n      return 2 * Math.PI * radius;\n    </new_code>\n  `,
            },
            {
                example: ps`\n      class Car {\n        private speed: number;\n\n        constructor(speed: number) {\n          this.speed = speed;\n        }\n\n        getSpeed(): number {\n          return this.speed;\n        }\n\n        setSpeed(newSpeed: number): void {\n          {{cursor}}\n        }\n      }\n    `,
                response: ps`\n      this.speed = newSpeed;\n    </new_code>\n  `,
            },
            {
                example: ps`\n      interface Shape {\n        getArea(): number;\n        getPerimeter(): number;\n      }\n\n      class Rectangle implements Shape {\n        private width: number;\n        private height: number;\n\n        constructor(width: number, height: number) {\n          this.width = width;\n          this.height = height;\n        }\n\n        getArea(): number {\n          return this.width * this.height;\n        }\n\n        getPerimeter(): number {\n          {{cursor}}\n        }\n      }\n    `,
                response: ps`\n      return 2 * (this.width + this.height);\n    </new_code>\n  `,
            },
            {
                example: ps`\n      const person = {\n        firstName: 'John',\n        lastName: 'Doe',\n        age: 30,\n        getFullName: function() {\n          {{cursor}}\n        }\n      };\n    `,
                response: ps`\n      return this.firstName + ' ' + this.lastName;\n    </new_code>\n  `,
            },
            {
                example: ps`\n      enum Direction {\n        North,\n        South,\n        East,\n        {{cursor}}\n      }\n    `,
                response: ps`\n      West\n    </new_code>\n  `,
            },
        ]

        const examples = ps`
Here are a few examples of successfully generated code:

<examples>
${PromptString.join(
    examplesArray.map(example => {
        return ps`
<example>
H: <existing_code>
    ${example.example}
    </existing_code>

A: ${example.response}
</example>
`
    }),
    ps`\n`
)}
</examples>`

        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: [
                {
                    speaker: 'system',
                    text: ps`
You are a tremendously accurate and skilled coding autocomplete agent. We want to generate new ${languageId} code inside the file '${relativeFilePath}'.
The existing code is provided in <existing_code></existing_code> tags.
The new code you will generate will start at the position of the cursor, which is currently indicated by the {{cursor}} tag.
In your process, first, review the existing code to understand its logic and format. Then, try to determine the best code to generate at the cursor position.
When generating the new code, please ensure the following:
1. It is valid ${languageId} code.
2. It matches the existing code's variable, parameter and function names.
3. It does not repeat any existing code. Do not repeat code that comes before or after the cursor tags. This includes cases where the cursor is in the middle of a word.
4. If the cursor is in the middle of a word, it finishes the word instead of repeating code before the cursor tag.
Return new code enclosed in <new_code></new_code> tags. We will then insert this at the {{cursor}} position.
If you are not able to write code based on the given instructions return an empty result like <new_code></new_code>

${examples}`,
                },
                { speaker: 'human', text: this.createPrompt(snippets) },
                {
                    speaker: 'assistant',
                    text: ps`<new_code>`,
                },
            ],
            topP: 0.5,
            temperature: 0.2,
            model: 'openai/gpt-4o',
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({
            length: this.options.n,
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
                providerSpecificPostProcess: this.postProcess,
                providerOptions: this.options,
            })
        })

        return zipGenerators(completionsGenerators)
    }

    private postProcess = (rawResponse: string): string => {
        let completion = extractFromCodeBlock(rawResponse)
        completion = completion.replaceAll('<new_code>', '')
        completion = completion.slice(0, completion.indexOf('</new_code>'))

        const trimmedPrefixContainNewline = this.options.docContext.prefix
            .slice(this.options.docContext.prefix.trimEnd().length)
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

export function createProviderConfig({
    model,
    maxContextTokens = 2048,
    ...otherOptions
}: UnstableOpenAIOptions & { model?: string }): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new UnstableOpenAIProvider(
                {
                    ...options,
                    id: PROVIDER_IDENTIFIER,
                },
                {
                    maxContextTokens,
                    ...otherOptions,
                }
            )
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        identifier: PROVIDER_IDENTIFIER,
        model: model ?? 'gpt-35-turbo',
    }
}
