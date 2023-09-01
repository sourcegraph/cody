import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { CodeCompletionsClient } from '../client'
import { getLanguageConfig } from '../language'
import { canUsePartialCompletion } from '../streaming'
import { Completion, ContextSnippet } from '../types'
import { forkSignal } from '../utils'

import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './provider'

interface UnstableFireworksOptions {
    client: Pick<CodeCompletionsClient, 'complete'>
    model: keyof typeof MODEL_MAP
}

const PROVIDER_IDENTIFIER = 'fireworks'
const CONTEXT_WINDOW_CHARS = 5000 // ~ 2000 token limit

const EOT_STARCODER = '<|endoftext|>'
const EOT_LLAMA_CODE = ' <EOT>'

// Model identifiers can be found in https://docs.fireworks.ai/explore/ and in our internal
// conversations
const MODEL_MAP = {
    'starcoder-16b': 'fireworks/accounts/fireworks/models/starcoder-16b-w8a16',
    'starcoder-7b': 'fireworks/accounts/fireworks/models/starcoder-7b-w8a16',
    'starcoder-3b': 'fireworks/accounts/fireworks/models/starcoder-3b-w8a16',
    'starcoder-1b': 'fireworks/accounts/fireworks/models/starcoder-1b-w8a16',
    'wizardcoder-15b': 'fireworks/accounts/fireworks/models/wizardcoder-15b',
    'llama-code-7b': 'fireworks/accounts/fireworks/models/llama-v2-7b-code',
    'llama-code-13b': 'fireworks/accounts/fireworks/models/llama-v2-13b-code',
    'llama-code-13b-instruct': 'fireworks/accounts/fireworks/models/llama-v2-13b-code-instruct',
}

export class UnstableFireworksProvider extends Provider {
    private client: Pick<CodeCompletionsClient, 'complete'>
    private model: keyof typeof MODEL_MAP

    constructor(options: ProviderOptions, { client, model }: UnstableFireworksOptions) {
        super(options)
        this.client = client
        this.model = model
    }

    private createPrompt(snippets: ContextSnippet[]): string {
        const maxPromptChars = CONTEXT_WINDOW_CHARS - CONTEXT_WINDOW_CHARS * this.options.responsePercentage
        const { prefix, suffix } = this.options.docContext

        const intro: string[] = []
        let prompt = ''

        const languageConfig = getLanguageConfig(this.options.languageId)
        if (languageConfig) {
            intro.push(`Path: ${this.options.fileName}`)
        }

        for (let snippetsToInclude = 0; snippetsToInclude < snippets.length + 1; snippetsToInclude++) {
            if (snippetsToInclude > 0) {
                const snippet = snippets[snippetsToInclude - 1]
                intro.push(`Here is a reference snippet of code from ${snippet.fileName}:\n\n${snippet.content}`)
            }

            const introString =
                intro
                    .join('\n\n')
                    .split('\n')
                    .map(line => (languageConfig ? languageConfig.commentStart + line : ''))
                    .join('\n') + '\n'

            const suffixAfterFirstNewline = getSuffixAfterFirstNewline(suffix)

            const nextPrompt = this.createInfillingPrompt(introString, prefix, suffixAfterFirstNewline)

            if (nextPrompt.length >= maxPromptChars) {
                return prompt
            }

            prompt = nextPrompt
        }

        return prompt
    }

    public async generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): Promise<Completion[]> {
        const prompt = this.createPrompt(snippets)

        const args: CompletionParameters = {
            messages: [{ speaker: 'human', text: prompt }],
            // To speed up sample generation in single-line case, we request a lower token limit
            // since we can't terminate on the first `\n`.
            maxTokensToSample: this.options.multiline ? 256 : 30,
            ...getModelConfig(this.model),
            model: MODEL_MAP[this.model],
        }

        tracer?.params(args)

        // Issue request
        const responses = await this.batchAndProcessCompletions(this.client, args, this.options.n, abortSignal)

        const ret = responses.map(resp => [
            {
                prefix: this.options.docContext.prefix,
                content: resp.completion,
                stopReason: resp.stopReason,
            },
        ])

        const completions = ret.flat()
        tracer?.result({ rawResponses: responses, completions })

        return completions
    }

    private createInfillingPrompt(intro: string, prefix: string, suffix: string): string {
        if (this.model.startsWith('starcoder') || this.model.startsWith('wizardcoder')) {
            // c.f. https://starcoder.co/bigcode/starcoder#fill-in-the-middle
            return `<fim_prefix>${intro}${prefix}<fim_suffix>${suffix}<fim_middle>`
        }
        if (this.model.startsWith('llama-code')) {
            // c.f. https://github.com/facebookresearch/codellama/blob/main/llama/generation.py#L402
            return `<PRE> ${intro}${prefix} <SUF>${suffix} <MID>`
        }

        console.error('Could not generate infilling prompt for', this.model)
        return `${intro}${prefix}`
    }

    private async batchAndProcessCompletions(
        client: Pick<CodeCompletionsClient, 'complete'>,
        params: CompletionParameters,
        n: number,
        abortSignal: AbortSignal
    ): Promise<CompletionResponse[]> {
        const responses: Promise<CompletionResponse>[] = []
        for (let i = 0; i < n; i++) {
            responses.push(this.fetchAndProcessCompletions(client, params, abortSignal))
        }
        return Promise.all(responses)
    }

    private async fetchAndProcessCompletions(
        client: Pick<CodeCompletionsClient, 'complete'>,
        params: CompletionParameters,
        abortSignal: AbortSignal
    ): Promise<CompletionResponse> {
        // The Async executor is required to return the completion early if a partial result from SSE can be used.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            try {
                const abortController = forkSignal(abortSignal)

                const result = await client.complete(
                    params,
                    (incompleteResponse: CompletionResponse) => {
                        const processedCompletion = this.postProcess(incompleteResponse.completion)
                        if (
                            canUsePartialCompletion(processedCompletion, {
                                document: { languageId: this.options.languageId },
                                multiline: this.options.multiline,
                                docContext: this.options.docContext,
                            })
                        ) {
                            resolve({ ...incompleteResponse, completion: processedCompletion })
                            abortController.abort()
                        }
                    },
                    abortController.signal
                )

                resolve({ ...result, completion: this.postProcess(result.completion) })
            } catch (error) {
                reject(error)
            }
        })
    }

    private postProcess(content: string): string {
        if (this.model.startsWith('starcoder') || this.model.startsWith('wizardcoder')) {
            return content.replace(EOT_STARCODER, '')
        }
        if (this.model.startsWith('llama-code')) {
            return content.replace(EOT_LLAMA_CODE, '')
        }
        return content
    }
}

export function createProviderConfig(
    unstableFireworksOptions: Omit<UnstableFireworksOptions, 'model'> & { model: string | null }
): ProviderConfig {
    const model =
        unstableFireworksOptions.model === null || unstableFireworksOptions.model === ''
            ? 'starcoder-7b'
            : Object.prototype.hasOwnProperty.call(MODEL_MAP, unstableFireworksOptions.model)
            ? (unstableFireworksOptions.model as keyof typeof MODEL_MAP)
            : null

    if (model === null) {
        throw new Error(`Unknown model: \`${unstableFireworksOptions.model}\``)
    }

    return {
        create(options: ProviderOptions) {
            return new UnstableFireworksProvider(options, { ...unstableFireworksOptions, model })
        },
        maximumContextCharacters: CONTEXT_WINDOW_CHARS,
        enableExtendedMultilineTriggers: true,
        identifier: PROVIDER_IDENTIFIER,
        supportsInfilling: true,
        model,
    }
}

// We want to remove the same line suffix from a completion request since both StarCoder and Llama
// code can't handle this correctly.
function getSuffixAfterFirstNewline(suffix: string): string {
    const firstNlInSuffix = suffix.indexOf('\n')

    // When there is no next line, the suffix should be empty
    if (firstNlInSuffix === -1) {
        return ''
    }

    return suffix.slice(suffix.indexOf('\n'))
}

function getModelConfig(model: string): { temperature: number; topP: number } {
    if (model.startsWith('llama-code')) {
        return {
            temperature: 0.2,
            topP: 0.95,
        }
    }

    return {
        temperature: 0.4,
        topP: 0.95,
    }
}
