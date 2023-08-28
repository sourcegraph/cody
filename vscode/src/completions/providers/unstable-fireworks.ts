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
    model: null | string
}

const PROVIDER_IDENTIFIER = 'fireworks'
const STOP_WORD = '<|endoftext|>'
const CONTEXT_WINDOW_CHARS = 5000 // ~ 2000 token limit

// Model identifiers can be found in https://docs.fireworks.ai/explore/ and in our internal
// conversations
const MODEL_MAP = {
    'starcoder-16b': 'fireworks/accounts/fireworks/models/starcoder-16b-w8a16',
    'starcoder-7b': 'fireworks/accounts/fireworks/models/starcoder-7b-w8a16',
    'starcoder-3b': 'fireworks/accounts/fireworks/models/starcoder-3b-w8a16',
    'starcoder-1b': 'fireworks/accounts/fireworks/models/starcoder-1b-w8a16',
    'llama-code-13b-instruct': 'fireworks/accounts/fireworks/models/llama-v2-13b-code-instruct',
}

export class UnstableFireworksProvider extends Provider {
    private client: Pick<CodeCompletionsClient, 'complete'>
    private model: keyof typeof MODEL_MAP

    constructor(options: ProviderOptions, { client, model }: UnstableFireworksOptions) {
        super(options)
        this.client = client
        if (model === null || model === '') {
            this.model = 'starcoder-7b'
        } else if (Object.prototype.hasOwnProperty.call(MODEL_MAP, model)) {
            this.model = model as keyof typeof MODEL_MAP
        } else {
            throw new Error(`Unknown model: \`${model}\``)
        }
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

            const suffixAfterFirstNewline = suffix.slice(suffix.indexOf('\n'))

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
            temperature: 0.4,
            topP: 0.95,
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
        if (this.model.startsWith('starcoder')) {
            // c.f. https://starcoder.co/bigcode/starcoder#fill-in-the-middle
            return `<fim_prefix>${intro}${prefix}<fim_suffix>${suffix}<fim_middle>`
        }
        if (this.model.startsWith('llama-code')) {
            // @TODO(philipp-spiess): FIM prompt is not working yet, we're working with Fireworks to
            // get this sorted
            //
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
                        const processedCompletion = postProcess(incompleteResponse.completion)
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

                resolve({ ...result, completion: postProcess(result.completion) })
            } catch (error) {
                reject(error)
            }
        })
    }
}

function postProcess(content: string): string {
    return content.replace(STOP_WORD, '')
}

export function createProviderConfig(unstableFireworksOptions: UnstableFireworksOptions): ProviderConfig {
    return {
        create(options: ProviderOptions) {
            return new UnstableFireworksProvider(options, unstableFireworksOptions)
        },
        maximumContextCharacters: CONTEXT_WINDOW_CHARS,
        enableExtendedMultilineTriggers: true,
        identifier: PROVIDER_IDENTIFIER,
        supportsInfilling: true,
    }
}
