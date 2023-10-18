import * as vscode from 'vscode'

import { tokensToChars } from '@sourcegraph/cody-shared/src/prompt/constants'
import { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { canUsePartialCompletion } from '../can-use-partial-completion'
import { CodeCompletionsClient, CodeCompletionsParams } from '../client'
import { getLanguageConfig } from '../language'
import { parseAndTruncateCompletion } from '../text-processing/parse-and-truncate-completion'
import { InlineCompletionItemWithAnalytics } from '../text-processing/process-inline-completions'
import { ContextSnippet } from '../types'
import { forkSignal } from '../utils'

import {
    CompletionProviderTracer,
    Provider,
    ProviderConfig,
    ProviderOptions,
    standardContextSizeHints,
} from './provider'

export interface FireworksOptions {
    model: FireworksModel
    maxContextTokens?: number
    client: Pick<CodeCompletionsClient, 'complete'>
    starcoderExtendedTokenWindow?: boolean
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

type FireworksModel =
    | keyof typeof MODEL_MAP
    // `starcoder-hybrid` uses the 16b model for multiline requests and the 7b model for single line
    | 'starcoder-hybrid'

function getMaxContextTokens(model: FireworksModel, starcoderExtendedTokenWindow?: boolean): number {
    switch (model) {
        case 'starcoder-hybrid':
        case 'starcoder-16b':
        case 'starcoder-7b':
        case 'starcoder-3b':
        case 'starcoder-1b': {
            // StarCoder supports up to 8k tokens, we limit it to ~2k for evaluation against
            // our current Anthropic prompt but allow for 6k for the extended token window as
            // defined by the feature flag
            return starcoderExtendedTokenWindow ? 6144 : 2048
        }
        case 'wizardcoder-15b':
            // TODO: Confirm what the limit is for WizardCoder
            return 2048
        case 'llama-code-7b':
        case 'llama-code-13b':
        case 'llama-code-13b-instruct':
            // Llama Code was trained on 16k context windows, we're constraining it here to better
            // compare the results
            return 2048
        default:
            return 1200
    }
}

const MAX_RESPONSE_TOKENS = 256

export class FireworksProvider extends Provider {
    private model: FireworksModel
    private promptChars: number
    private client: Pick<CodeCompletionsClient, 'complete'>

    constructor(
        options: ProviderOptions,
        { model, maxContextTokens, client }: Required<Omit<FireworksOptions, 'starcoderExtendedTokenWindow'>>
    ) {
        super(options)
        this.model = model
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.client = client
    }

    private createPrompt(snippets: ContextSnippet[]): string {
        const { prefix, suffix } = this.options.docContext

        const intro: string[] = []
        let prompt = ''

        const languageConfig = getLanguageConfig(this.options.document.languageId)

        // In StarCoder we have a special token to announce the path of the file
        if (!isStarCoderFamily(this.model)) {
            intro.push(`Path: ${this.options.document.fileName}`)
        }

        for (let snippetsToInclude = 0; snippetsToInclude < snippets.length + 1; snippetsToInclude++) {
            if (snippetsToInclude > 0) {
                const snippet = snippets[snippetsToInclude - 1]
                if ('symbol' in snippet && snippet.symbol !== '') {
                    intro.push(`Additional documentation for \`${snippet.symbol}\`:\n\n${snippet.content}`)
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
                vscode.workspace.asRelativePath(this.options.document.fileName),
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

    public async generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): Promise<InlineCompletionItemWithAnalytics[]> {
        const { multiline } = this.options
        const prompt = this.createPrompt(snippets)

        const model =
            this.model === 'starcoder-hybrid'
                ? MODEL_MAP[multiline ? 'starcoder-16b' : 'starcoder-7b']
                : MODEL_MAP[this.model]

        const args: CodeCompletionsParams = {
            messages: [{ speaker: 'human', text: prompt }],
            // To speed up sample generation in single-line case, we request a lower token limit
            // since we can't terminate on the first `\n`.
            maxTokensToSample: multiline ? MAX_RESPONSE_TOKENS : 30,
            temperature: 0.2,
            topP: 0.95,
            topK: 0,
            model,
            stopSequences: multiline ? ['\n\n', '\n\r\n'] : ['\n'],
            timeoutMs: multiline ? 15000 : 5000,
        }

        tracer?.params(args)

        const completions = await Promise.all(
            Array.from({ length: this.options.n }).map(() => {
                return this.fetchAndProcessCompletions(this.client, args, abortSignal)
            })
        )

        tracer?.result({ completions })

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

    private async fetchAndProcessCompletions(
        client: Pick<CodeCompletionsClient, 'complete'>,
        params: CodeCompletionsParams,
        abortSignal: AbortSignal
    ): Promise<InlineCompletionItemWithAnalytics> {
        // The Async executor is required to return the completion early if a partial result from SSE can be used.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            try {
                const abortController = forkSignal(abortSignal)

                const result = await client.complete(
                    params,
                    (incompleteResponse: CompletionResponse) => {
                        if (this.options.useStreamingTruncation) {
                            const processedCompletion = this.postProcess(incompleteResponse.completion)
                            const completion = canUsePartialCompletion(processedCompletion, this.options)

                            if (completion) {
                                resolve({ ...completion, stopReason: 'streaming-truncation' })
                                abortController.abort()
                            }
                        }
                    },
                    abortController.signal
                )

                const processedCompletion = this.postProcess(result.completion)
                const completion = parseAndTruncateCompletion(processedCompletion, this.options)

                resolve({ ...completion, stopReason: result.stopReason })
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

export function createProviderConfig({
    model,
    ...otherOptions
}: Omit<FireworksOptions, 'model' | 'maxContextTokens'> & { model: string | null }): ProviderConfig {
    const resolvedModel =
        model === null || model === ''
            ? 'starcoder-hybrid'
            : model === 'starcoder-hybrid'
            ? 'starcoder-hybrid'
            : Object.prototype.hasOwnProperty.call(MODEL_MAP, model)
            ? (model as keyof typeof MODEL_MAP)
            : null

    if (resolvedModel === null) {
        throw new Error(`Unknown model: \`${model}\``)
    }

    const maxContextTokens = getMaxContextTokens(resolvedModel, otherOptions.starcoderExtendedTokenWindow)

    return {
        create(options: ProviderOptions) {
            return new FireworksProvider(options, { model: resolvedModel, maxContextTokens, ...otherOptions })
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        enableExtendedMultilineTriggers: true,
        identifier: PROVIDER_IDENTIFIER,
        model: resolvedModel,
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
