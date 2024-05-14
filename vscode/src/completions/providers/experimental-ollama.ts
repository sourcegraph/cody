import type * as vscode from 'vscode'

import {
    type AutocompleteContextSnippet,
    type OllamaGenerateParams,
    type OllamaOptions,
    PromptString,
    createOllamaClient,
    ps,
} from '@sourcegraph/cody-shared'

import { logger } from '../../log'
import { getLanguageConfig } from '../../tree-sitter/language'
import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import { getSuffixAfterFirstNewline } from '../text-processing'
import {
    type FetchCompletionResult,
    fetchAndProcessDynamicMultilineCompletions,
} from './fetch-and-process-completions'
import { type OllamaModel, getModelHelpers } from './ollama-models'
import {
    type CompletionProviderTracer,
    Provider,
    type ProviderConfig,
    type ProviderOptions,
    standardContextSizeHints,
} from './provider'

interface OllamaPromptContext {
    snippets: AutocompleteContextSnippet[]
    context: PromptString
    currentFileNameComment: PromptString
    isInfill: boolean

    uri: vscode.Uri
    prefix: PromptString
    suffix: PromptString

    languageId: string
}

function fileNameLine(uri: vscode.Uri, commentStart: PromptString): PromptString {
    return ps`${commentStart} Path: ${PromptString.fromDisplayPath(uri)}\n`
}

/**
 * An *experimental* completion provider that uses [Ollama](https://ollama.ai), which is a tool for
 * running LLMs locally.
 *
 * The provider communicates with an Ollama server's [REST
 * API](https://github.com/jmorganca/ollama#rest-api).
 */
class ExperimentalOllamaProvider extends Provider {
    constructor(
        options: ProviderOptions,
        private readonly ollamaOptions: OllamaOptions
    ) {
        super(options)
    }

    protected createPromptContext(
        snippets: AutocompleteContextSnippet[],
        isInfill: boolean,
        modelHelpers: OllamaModel
    ): OllamaPromptContext {
        const { languageId, uri } = this.options.document
        const config = getLanguageConfig(languageId)
        const commentStart = config?.commentStart || ps`// `
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
            this.options.docContext,
            this.options.document.uri
        )

        const context = PromptString.join(
            snippets.map(snippet => {
                const contextPrompts = PromptString.fromAutocompleteContextSnippet(snippet)

                return ps`<file_sep>${PromptString.fromDisplayPath(uri)}\n${contextPrompts.content}`
                // return fileNameLine(uri, commentStart).concat(
                //     PromptString.join(
                //         contextPrompts.content.split('\n').map(line => ps`${commentStart} ${line}`),
                //         ps`\n`
                //     )
                // )
            }),
            ps``
        )

        const currentFileNameComment = fileNameLine(uri, commentStart)

        const prompt: OllamaPromptContext = {
            snippets,
            uri,
            languageId,
            context,
            currentFileNameComment,
            isInfill,
            prefix,
            suffix: getSuffixAfterFirstNewline(suffix),
        }

        // if (process.env.OLLAMA_CONTEXT_SNIPPETS) {
        // TODO(valery): find the balance between using context and keeping a good perf.
        // const maxPromptChars = 1234

        // for (const snippet of snippets) {
        // const extendedSnippets = [...prompt.snippets, snippet]
        // const promptLengthWithSnippet = modelHelpers.getPrompt({
        //     ...prompt,
        //     snippets: extendedSnippets,
        // }).length

        // if (promptLengthWithSnippet > maxPromptChars) {
        //     break
        // }

        // prompt.snippets = extendedSnippets
        // }
        // }

        return prompt
    }

    public generateCompletions(
        abortSignal: AbortSignal,
        snippets: AutocompleteContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        // Only use infill if the suffix is not empty
        const useInfill = this.options.docContext.suffix.trim().length > 0
        const isMultiline = this.options.multiline

        const timeoutMs = 5_0000
        const modelHelpers = getModelHelpers(this.ollamaOptions.model)
        const promptContext = this.createPromptContext(snippets, useInfill, modelHelpers)

        const requestParams = {
            prompt: modelHelpers.getPrompt(promptContext),
            template: '{{ .Prompt }}',
            model: this.ollamaOptions.model,
            options: modelHelpers.getRequestOptions(isMultiline),
        } satisfies OllamaGenerateParams

        if (this.ollamaOptions.parameters) {
            Object.assign(requestParams.options, this.ollamaOptions.parameters)
        }

        // TODO(valery): remove `any` casts
        tracer?.params(requestParams as any)
        const ollamaClient = createOllamaClient(this.ollamaOptions, logger)

        const completionsGenerators = Array.from({
            length: this.options.n,
        }).map(() => {
            const abortController = forkSignal(abortSignal)

            const completionResponseGenerator = generatorWithTimeout(
                ollamaClient.complete(requestParams, abortController),
                timeoutMs,
                abortController
            )

            return fetchAndProcessDynamicMultilineCompletions({
                completionResponseGenerator,
                abortController,
                providerSpecificPostProcess: insertText => insertText.trim(),
                providerOptions: this.options,
            })
        })

        return zipGenerators(completionsGenerators)
    }
}

const PROVIDER_IDENTIFIER = 'experimental-ollama'

export function isLocalCompletionsProvider(providerId: string): boolean {
    return providerId === PROVIDER_IDENTIFIER
}

export function createProviderConfig(ollamaOptions: OllamaOptions): ProviderConfig {
    return {
        create(options: Omit<ProviderOptions, 'id'>) {
            return new ExperimentalOllamaProvider(
                {
                    ...options,
                    // Always generate just one completion for a better perf.
                    n: 1,
                    // Increased first completion timeout value to account for the higher latency.
                    firstCompletionTimeout: 3_0000,
                    id: PROVIDER_IDENTIFIER,
                },
                ollamaOptions
            )
        },
        contextSizeHints: standardContextSizeHints(2048),
        identifier: PROVIDER_IDENTIFIER,
        model: ollamaOptions.model,
    }
}
