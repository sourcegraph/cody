import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { CodeCompletionsClient } from '../client'
import { getLanguageConfig } from '../language'
import { canUsePartialCompletion } from '../streaming'
import { formatSymbolContextRelationship } from '../text-processing'
import { Completion, ContextSnippet } from '../types'
import { forkSignal } from '../utils'

import { CompletionProviderTracer, Provider, ProviderConfig, ProviderOptions } from './provider'

interface UnstableFireworksOptions {
    client: Pick<CodeCompletionsClient, 'complete'>
    model: keyof typeof MODEL_MAP
}

const PROVIDER_IDENTIFIER = 'fireworks'

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

type FireworksModel = keyof typeof MODEL_MAP

function getContextWindowChars(model: FireworksModel): number {
    switch (model) {
        case 'starcoder-16b':
        case 'starcoder-7b':
        case 'starcoder-3b':
        case 'starcoder-1b':
            // StarCoder supports up to 8k tokens, we limit it to ~2k for evaluation against
            // our current Anthropic prompt
            return 8192 // ~ 2048 token limit
        case 'wizardcoder-15b':
            // TODO: Confirm what the limit is for WizardCoder
            return 8192 // ~ 2048 token limit
        case 'llama-code-7b':
        case 'llama-code-13b':
        case 'llama-code-13b-instruct':
            // Llama Code was trained on 16k context windows, we're constraining it here to better
            // compare the results
            return 8192 // ~ 2048 token limit
        default:
            return 5000
    }
}

export class UnstableFireworksProvider extends Provider {
    private client: Pick<CodeCompletionsClient, 'complete'>
    private model: FireworksModel

    constructor(options: ProviderOptions, { client, model }: UnstableFireworksOptions) {
        super(options)
        this.client = client
        this.model = model
    }

    private createPrompt(snippets: ContextSnippet[]): string {
        const contextWindowChars = getContextWindowChars(this.model)
        const maxPromptChars = contextWindowChars - contextWindowChars * this.options.responsePercentage
        const { prefix, suffix } = this.options.docContext

        const intro: string[] = []
        let prompt = ''

        const languageConfig = getLanguageConfig(this.options.languageId)

        // In StarCoder we have a special token to announce the path of the file
        if (!isStarCoderFamily(this.model)) {
            intro.push(`Path: ${this.options.fileName}`)
        }

        for (let snippetsToInclude = 0; snippetsToInclude < snippets.length + 1; snippetsToInclude++) {
            if (snippetsToInclude > 0) {
                const snippet = snippets[snippetsToInclude - 1]
                if ('symbol' in snippet && snippet.symbol !== '') {
                    intro.push(
                        `Additional documentation for \`${snippet.symbol}\`${formatSymbolContextRelationship(
                            snippet.sourceSymbolAndRelationship
                        )}:\n\n${snippet.content}`
                    )
                } else {
                    intro.push(`Here is a reference snippet of code from ${snippet.fileName}:\n\n${snippet.content}`)
                }
            }

            const introString =
                intro
                    .join('\n\n')
                    .split('\n')
                    .map(line => (languageConfig ? languageConfig.commentStart + line : '// '))
                    .join('\n') + '\n'

            const suffixAfterFirstNewline = getSuffixAfterFirstNewline(suffix)

            const nextPrompt = this.createInfillingPrompt(
                this.options.fileName,
                introString,
                prefix,
                suffixAfterFirstNewline
            )

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
            temperature: 0.2,
            topP: 0.95,
            topK: 0,
            model: MODEL_MAP[this.model],
            stopSequences: this.options.multiline ? ['\n\n', '\n\r\n'] : ['\n'],
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

    private createInfillingPrompt(filename: string, intro: string, prefix: string, suffix: string): string {
        if (isStarCoderFamily(this.model)) {
            // c.f. https://huggingface.co/bigcode/starcoder#fill-in-the-middle
            // c.f. https://arxiv.org/pdf/2305.06161.pdf
            return `<filename>${filename}<fim_prefix>${intro}${prefix}<fim_suffix>${suffix}<fim_middle>`
        }
        if (isLlamaCode(this.model)) {
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
        if (isStarCoderFamily(this.model)) {
            return content.replace(EOT_STARCODER, '')
        }
        if (isLlamaCode(this.model)) {
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

    const contextWindowChars = getContextWindowChars(model)

    return {
        create(options: ProviderOptions) {
            return new UnstableFireworksProvider(options, { ...unstableFireworksOptions, model })
        },
        maximumContextCharacters: contextWindowChars,
        enableExtendedMultilineTriggers: true,
        identifier: PROVIDER_IDENTIFIER,
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

function isStarCoderFamily(model: string): boolean {
    return model.startsWith('starcoder') || model.startsWith('wizardcoder')
}

function isLlamaCode(model: string): boolean {
    return model.startsWith('llama-code')
}
