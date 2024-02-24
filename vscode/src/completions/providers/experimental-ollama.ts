import type * as vscode from 'vscode'

import {
    type OllamaGenerateParams,
    type OllamaOptions,
    createOllamaClient,
    displayPath,
} from '@sourcegraph/cody-shared'

import { logger } from '../../log'
import { getLanguageConfig } from '../../tree-sitter/language'
import type { ContextSnippet } from '../types'
import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import { getSuffixAfterFirstNewline } from '../text-processing'
import {
    type FetchCompletionResult,
    fetchAndProcessCompletions,
    fetchAndProcessDynamicMultilineCompletions,
} from './fetch-and-process-completions'
import { type OllamaModel, getModelHelpers } from './ollama-models'
import {
    type CompletionProviderTracer,
    Provider,
    type ProviderConfig,
    type ProviderOptions,
} from './provider'

interface OllamaPromptContext {
    snippets: { uri: vscode.Uri; content: string }[]
    context: string
    currentFileNameComment: string
    isInfill: boolean

    uri: vscode.Uri
    prefix: string
    suffix: string

    languageId: string
}

function fileNameLine(uri: vscode.Uri, commentStart: string): string {
    return `${commentStart} Path: ${displayPath(uri)}\n`
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
        snippets: ContextSnippet[],
        isInfill: boolean,
        modelHelpers: OllamaModel
    ): OllamaPromptContext {
        const { languageId, uri } = this.options.document
        const config = getLanguageConfig(languageId)
        const commentStart = config?.commentStart || '//'

        const context = snippets
            .map(
                ({ uri, content }) =>
                    fileNameLine(uri, commentStart) +
                    content
                        .split('\n')
                        .map(line => `${commentStart} ${line}`)
                        .join('\n')
            )
            .join('\n\n')

        const currentFileNameComment = fileNameLine(uri, commentStart)

        const prompt: OllamaPromptContext = {
            snippets: [],
            uri,
            languageId,
            context,
            currentFileNameComment,
            isInfill,
            prefix: this.options.docContext.prefix,
            suffix: getSuffixAfterFirstNewline(this.options.docContext.suffix),
        }

        if (process.env.OLLAMA_CONTEXT_SNIPPETS) {
            // TODO(valery): find the balance between using context and keeping a good perf.
            const maxPromptChars = 1234

            for (const snippet of snippets) {
                const extendedSnippets = [...prompt.snippets, snippet]
                const promptLengthWithSnippet = modelHelpers.getPrompt({
                    ...prompt,
                    snippets: extendedSnippets,
                }).length

                if (promptLengthWithSnippet > maxPromptChars) {
                    break
                }

                prompt.snippets = extendedSnippets
            }
        }

        return prompt
    }

    public generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        // Only use infill if the suffix is not empty
        const useInfill = this.options.docContext.suffix.trim().length > 0
        const isMultiline = this.options.multiline
        const isDynamicMultiline = Boolean(this.options.dynamicMultilineCompletions)

        const timeoutMs = 5_0000
        const modelHelpers = getModelHelpers(this.ollamaOptions.model)
        const promptContext = this.createPromptContext(snippets, useInfill, modelHelpers)

        const requestParams = {
            prompt: modelHelpers.getPrompt(promptContext),
            template: '{{ .Prompt }}',
            model: this.ollamaOptions.model,
            options: modelHelpers.getRequestOptions(isMultiline, isDynamicMultiline),
        } satisfies OllamaGenerateParams

        if (this.ollamaOptions.parameters) {
            Object.assign(requestParams.options, this.ollamaOptions.parameters)
        }

        // TODO(valery): remove `any` casts
        tracer?.params(requestParams as any)
        const ollamaClient = createOllamaClient(this.ollamaOptions, logger)
        const fetchAndProcessCompletionsImpl = isDynamicMultiline
            ? fetchAndProcessDynamicMultilineCompletions
            : fetchAndProcessCompletions

        const completionsGenerators = Array.from({
            length: this.options.n,
        }).map(() => {
            const abortController = forkSignal(abortSignal)

            const completionResponseGenerator = generatorWithTimeout(
                ollamaClient.complete(requestParams, abortController),
                timeoutMs,
                abortController
            )

            return fetchAndProcessCompletionsImpl({
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
        contextSizeHints: {
            // We don't use other files as context yet in Ollama, so this doesn't matter.
            totalChars: 0,

            // Ollama evaluates the prompt at ~50 tok/s for codellama:7b-code on a MacBook Air M2.
            // If the prompt has a common prefix across inference requests, subsequent requests do
            // not incur prompt reevaluation and are therefore much faster. So, we want a large
            // document prefix that covers the entire document (except in cases where the document
            // is very, very large, in which case Ollama would not work well anyway).
            prefixChars: 10000,

            // For the same reason above, we want a very small suffix because otherwise Ollama needs to
            // reevaluate more tokens in the prompt. This is because the prompt is (roughly) `prefix
            // (cursor position) suffix`, so even typing a single character at the cursor position
            // invalidates the LLM's cache of the suffix.
            suffixChars: 100,
        },
        identifier: PROVIDER_IDENTIFIER,
        model: ollamaOptions.model,
    }
}
