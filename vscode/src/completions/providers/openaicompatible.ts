import {
    type AuthStatus,
    type AutocompleteContextSnippet,
    type AutocompleteTimeouts,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type CompletionResponseGenerator,
    type ConfigurationWithAccessToken,
    type Model,
    PromptString,
    charsToTokens,
    ps,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import type * as vscode from 'vscode'
import { getLanguageConfig } from '../../tree-sitter/language'
import {
    CLOSING_CODE_TAG,
    OPENING_CODE_TAG,
    getHeadAndTail,
    getSuffixAfterFirstNewline,
} from '../text-processing'
import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import { logDebug } from '../../log'
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

interface OpenAICompatibleOptions {
    model: Model
    maxContextTokens?: number
    client: CodeCompletionsClient
    timeouts: AutocompleteTimeouts
    config: Pick<ConfigurationWithAccessToken, 'accessToken'>
    authStatus: Pick<AuthStatus, 'userCanUpgrade' | 'isDotCom' | 'endpoint'>
}

const PROVIDER_IDENTIFIER = 'openaicompatible'

class OpenAICompatibleProvider extends Provider {
    private model: Model
    private promptChars: number
    private client: CodeCompletionsClient
    private timeouts?: AutocompleteTimeouts

    constructor(
        options: ProviderOptions,
        { model, maxContextTokens, client, timeouts }: Required<OpenAICompatibleOptions>
    ) {
        super(options)
        this.timeouts = timeouts
        this.model = model
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.client = client
    }

    private createPrompt(snippets: AutocompleteContextSnippet[]): PromptString {
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
            this.options.docContext,
            this.options.document.uri
        )

        const intro: PromptString[] = []
        let prompt = ps``

        const languageConfig = getLanguageConfig(this.options.document.languageId)

        // In StarCoder we have a special token to announce the path of the file
        if (!isStarCoder(this.model)) {
            intro.push(ps`Path: ${PromptString.fromDisplayPath(this.options.document.uri)}`)
        }

        for (let snippetsToInclude = 0; snippetsToInclude < snippets.length + 1; snippetsToInclude++) {
            if (snippetsToInclude > 0) {
                const snippet = snippets[snippetsToInclude - 1]
                const contextPrompts = PromptString.fromAutocompleteContextSnippet(snippet)

                if (contextPrompts.symbol) {
                    intro.push(
                        ps`Additional documentation for \`${contextPrompts.symbol}\`:\n\n${contextPrompts.content}`
                    )
                } else {
                    intro.push(
                        ps`Here is a reference snippet of code from ${PromptString.fromDisplayPath(
                            snippet.uri
                        )}:\n\n${contextPrompts.content}`
                    )
                }
            }

            const joined = PromptString.join(intro, ps`\n\n`)
            const introString = ps`${PromptString.join(
                joined
                    .split('\n')
                    .map(line => ps`${languageConfig ? languageConfig.commentStart : ps`// `}${line}`),
                ps`\n`
            )}\n`

            const suffixAfterFirstNewline = getSuffixAfterFirstNewline(suffix)

            const nextPrompt = this.createInfillingPrompt(
                PromptString.fromDisplayPath(this.options.document.uri),
                introString,
                prefix,
                suffixAfterFirstNewline
            )

            if (nextPrompt.length >= this.promptChars) {
                return prompt
            }

            prompt = nextPrompt
        }

        return prompt
    }

    public generateCompletions(
        abortSignal: AbortSignal,
        snippets: AutocompleteContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        const partialRequestParams = getCompletionParams({
            providerOptions: this.options,
            timeouts: this.timeouts,
            lineNumberDependentCompletionParams:
                isStarChat(this.model) || isStarCoder(this.model)
                    ? getLineNumberDependentCompletionParams({
                          singlelineStopSequences: ['\n', '<|endoftext|>', '<file_sep>'],
                          multilineStopSequences: ['\n\n', '\n\r\n', '<|endoftext|>', '<file_sep>'],
                      })
                    : getLineNumberDependentCompletionParams({
                          singlelineStopSequences: ['\n'],
                          multilineStopSequences: ['\n\n', '\n\r\n'],
                      }),
        })

        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
            this.options.docContext,
            this.options.document.uri
        )

        // starchat: Only use infill if the suffix is not empty
        const useInfill = this.options.docContext.suffix.trim().length > 0
        const promptProps: Prompt = {
            snippets: [],
            uri: this.options.document.uri,
            prefix,
            suffix,
            languageId: this.options.document.languageId,
        }

        const prompt = isStarChat(this.model)
            ? promptString(promptProps, useInfill, this.model.model)
            : this.createPrompt(snippets)

        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: [{ speaker: 'human', text: prompt }],
            temperature: 0.2,
            topK: 0,
            model: this.model.model,
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: this.options.n }).map(() => {
            const abortController = forkSignal(abortSignal)

            const completionResponseGenerator = generatorWithTimeout(
                this.createDefaultClient(requestParams, abortController),
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

        /**
         * This implementation waits for all generators to yield values
         * before passing them to the consumer (request-manager). While this may appear
         * as a performance bottleneck, it's necessary for the current design.
         *
         * The consumer operates on promises, allowing only a single resolve call
         * from `requestManager.request`. Therefore, we must wait for the initial
         * batch of completions before returning them collectively, ensuring all
         * are included as suggested completions.
         *
         * To circumvent this performance issue, a method for adding completions to
         * the existing suggestion list is needed. Presently, this feature is not
         * available, and the switch to async generators maintains the same behavior
         * as with promises.
         */
        return zipGenerators(completionsGenerators)
    }

    private createInfillingPrompt(
        filename: PromptString,
        intro: PromptString,
        prefix: PromptString,
        suffix: PromptString
    ): PromptString {
        if (isStarCoder(this.model) || isStarChat(this.model)) {
            // c.f. https://huggingface.co/bigcode/starcoder#fill-in-the-middle
            // c.f. https://arxiv.org/pdf/2305.06161.pdf
            return ps`<filename>${filename}<fim_prefix>${intro}${prefix}<fim_suffix>${suffix}<fim_middle>`
        }
        if (isMistral(this.model) || isMixtral(this.model)) {
            const { head, tail } = getHeadAndTail(prefix)
            const infillBlock = tail.trimmed.toString().endsWith('{\n')
                ? tail.trimmed.trimEnd()
                : tail.trimmed
            const infillPrefix = head.raw
            return ps`<s>[INST] Below is the code from file path ${PromptString.fromDisplayPath(
                this.options.document.uri
            )}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:
\`\`\`
${intro}${infillPrefix ? infillPrefix : ''}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${suffix}
\`\`\`[/INST]
 ${OPENING_CODE_TAG}${infillBlock}`
        }

        logDebug('OpenAICompatible', 'Could not generate infilling prompt for model', this.model.model)
        return ps`${intro}${prefix}`
    }

    private postProcess = (content: string): string => {
        if (isStarCoder(this.model)) {
            return content.replace('<|endoftext|>', '').replace('<file_sep>', '')
        }
        if (isStarChat(this.model)) {
            return content.replace('<|end|>', '')
        }
        return content
    }

    private createDefaultClient(
        requestParams: CodeCompletionsParams,
        abortController: AbortController
    ): CompletionResponseGenerator {
        return this.client.complete(requestParams, abortController)
    }
}

export function createProviderConfig({
    model,
    timeouts,
    ...otherOptions
}: Omit<OpenAICompatibleOptions, 'maxContextTokens'>): ProviderConfig {
    logDebug('OpenAICompatible', 'autocomplete provider using model', JSON.stringify(model))

    // TODO(slimsag): self-hosted-models: properly respect ClientSideConfig options in the future
    logDebug('OpenAICompatible', 'note: not all clientSideConfig options are respected yet.')

    // TODO(slimsag): self-hosted-models: lift ClientSideConfig defaults to a standard centralized location
    const maxContextTokens = charsToTokens(
        model.clientSideConfig?.openAICompatible?.contextSizeHintTotalCharacters || 4096
    )

    return {
        create(options: ProviderOptions) {
            return new OpenAICompatibleProvider(
                {
                    ...options,
                    id: PROVIDER_IDENTIFIER,
                },
                {
                    model: model,
                    maxContextTokens,
                    timeouts,
                    ...otherOptions,
                }
            )
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        identifier: PROVIDER_IDENTIFIER,
        model: model.model,
    }
}

// TODO(slimsag): self-hosted-models: eliminate model-specific conditionals here entirely
// by relying on ClientSideConfig appropriately.
function isStarChat(model: Model): boolean {
    return model.model.startsWith('starchat')
}

function isStarCoder(model: Model): boolean {
    return model.model.startsWith('starcoder')
}

function isMistral(model: Model): boolean {
    return model.model.startsWith('mistral')
}

function isMixtral(model: Model): boolean {
    return model.model.startsWith('mixtral')
}

interface Prompt {
    snippets: { uri: vscode.Uri; content: PromptString }[]

    uri: vscode.Uri
    prefix: PromptString
    suffix: PromptString

    languageId: string
}

function fileNameLine(uri: vscode.Uri, commentStart: PromptString): PromptString {
    return ps`${commentStart} Path: ${PromptString.fromDisplayPath(uri)}\n`
}

function promptString(prompt: Prompt, infill: boolean, model: string): PromptString {
    const config = getLanguageConfig(prompt.languageId)
    const commentStart = config?.commentStart || ps`// `

    const context = PromptString.join(
        prompt.snippets.map(
            ({ uri, content }) =>
                ps`${fileNameLine(uri, commentStart)}${PromptString.join(
                    content.split('\n').map(line => ps`${commentStart} ${line}`),
                    ps`\n`
                )}`
        ),
        ps`\n\n`
    )
    const currentFileNameComment = fileNameLine(prompt.uri, commentStart)
    return context.concat(currentFileNameComment, prompt.prefix)
}
