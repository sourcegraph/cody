import type * as vscode from 'vscode'

import { displayPath, type OllamaOptions } from '@sourcegraph/cody-shared'

import { logger } from '../../log'
import { getLanguageConfig } from '../../tree-sitter/language'
import type { ContextSnippet } from '../types'
import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import { fetchAndProcessCompletions, type FetchCompletionResult } from './fetch-and-process-completions'
import { createOllamaClient, type OllamaGenerateParams } from './ollama-client'
import {
    Provider,
    type CompletionProviderTracer,
    type ProviderConfig,
    type ProviderOptions,
} from './provider'

interface LlamaCodePrompt {
    snippets: { uri: vscode.Uri; content: string }[]

    uri: vscode.Uri
    prefix: string
    suffix: string

    languageId: string
}

function fileNameLine(uri: vscode.Uri, commentStart: string): string {
    return `${commentStart} Path: ${displayPath(uri)}\n`
}

function llamaCodePromptString(prompt: LlamaCodePrompt, infill: boolean, model: string): string {
    const config = getLanguageConfig(prompt.languageId)
    const commentStart = config?.commentStart || '//'

    const context = prompt.snippets
        .map(
            ({ uri, content }) =>
                fileNameLine(uri, commentStart) +
                content
                    .split('\n')
                    .map(line => `${commentStart} ${line}`)
                    .join('\n')
        )
        .join('\n\n')

    const currentFileNameComment = fileNameLine(prompt.uri, commentStart)

    if (model.startsWith('codellama:') && infill) {
        const infillPrefix = context + currentFileNameComment + prompt.prefix

        /**
         * The infilll prompt for Code Llama.
         * Source: https://github.com/facebookresearch/codellama/blob/e66609cfbd73503ef25e597fd82c59084836155d/llama/generation.py#L418
         *
         * Why are there spaces left and right?
         * > For instance, the model expects this format: `<PRE> {pre} <SUF>{suf} <MID>`.
         * But you won’t get infilling if the last space isn’t added such as in `<PRE> {pre} <SUF>{suf}<MID>`
         *
         * Source: https://blog.fireworks.ai/simplifying-code-infilling-with-code-llama-and-fireworks-ai-92c9bb06e29c
         */
        return `<PRE> ${infillPrefix} <SUF>${prompt.suffix} <MID>`
    }

    return context + currentFileNameComment + prompt.prefix
}

/**
 * An *experimental* completion provider that uses [Ollama](https://ollama.ai), which is a tool for
 * running LLMs locally.
 *
 * The provider communicates with an Ollama server's [REST
 * API](https://github.com/jmorganca/ollama#rest-api).
 */
class UnstableOllamaProvider extends Provider {
    constructor(
        options: ProviderOptions,
        private readonly ollamaOptions: OllamaOptions
    ) {
        super(options)
    }

    protected createPrompt(snippets: ContextSnippet[], infill: boolean): LlamaCodePrompt {
        const prompt: LlamaCodePrompt = {
            snippets: [],
            uri: this.options.document.uri,
            prefix: this.options.docContext.prefix,
            suffix: this.options.docContext.suffix,
            languageId: this.options.document.languageId,
        }

        if (process.env.OLLAMA_CONTEXT_SNIPPETS) {
            // TODO(valery): find the balance between using context and keeping a good perf.
            const maxPromptChars = 1234

            for (const snippet of snippets) {
                const extendedSnippets = [...prompt.snippets, snippet]
                const promptLengthWithSnippet = llamaCodePromptString(
                    { ...prompt, snippets: extendedSnippets },
                    infill,
                    this.ollamaOptions.model
                ).length

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
        let timeoutMs = 5_0000

        const requestParams = {
            prompt: llamaCodePromptString(
                this.createPrompt(snippets, useInfill),
                useInfill,
                this.ollamaOptions.model
            ),
            template: '{{ .Prompt }}',
            model: this.ollamaOptions.model,
            options: {
                stop: SINGLE_LINE_STOP_SEQUENCES,
                temperature: 0.2,
                top_k: -1,
                top_p: -1,
                num_predict: 30,
            },
        } satisfies OllamaGenerateParams

        if (this.options.multiline) {
            timeoutMs = 15_0000

            Object.assign(requestParams.options, {
                num_predict: 256,
                stop: MULTI_LINE_STOP_SEQUENCES,
            })
        }

        if (this.ollamaOptions.parameters) {
            Object.assign(requestParams.options, this.ollamaOptions.parameters)
        }

        // TODO(valery): remove `any` casts
        tracer?.params(requestParams as any)
        const ollamaClient = createOllamaClient(this.ollamaOptions, logger)

        const completionsGenerators = Array.from({ length: this.options.n }).map(() => {
            const abortController = forkSignal(abortSignal)

            const completionResponseGenerator = generatorWithTimeout(
                ollamaClient.complete(requestParams, abortController),
                timeoutMs,
                abortController
            )

            return fetchAndProcessCompletions({
                completionResponseGenerator,
                abortController,
                providerSpecificPostProcess: insertText => insertText.trim(),
                providerOptions: this.options,
            })
        })

        return zipGenerators(completionsGenerators)
    }
}

const EOT_TOKEN = '<EOT>'
const SHARED_STOP_SEQUENCES = [
    '// Path:',
    '\u001E',
    '\u001C',
    EOT_TOKEN,

    // Tokens that reduce the quality of multi-line completions but improve performance.
    '; ',
    ';\t',
]

const SINGLE_LINE_STOP_SEQUENCES = ['\n', ...SHARED_STOP_SEQUENCES]

// TODO(valery): find the balance between using less stop tokens to get more multiline completions and keeping a good perf.
// `SHARED_STOP_SEQUENCES` are not included because the number of multiline completions goes down significantly
// leaving an impression that Ollama provider support only singleline completions.
const MULTI_LINE_STOP_SEQUENCES: string[] = ['\n\n', EOT_TOKEN /* ...SHARED_STOP_SEQUENCES */]

const PROVIDER_IDENTIFIER = 'unstable-ollama'
export function createProviderConfig(ollamaOptions: OllamaOptions): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            // Always generate just one completion for a better perf.
            options.n = 1

            return new UnstableOllamaProvider(options, ollamaOptions)
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
