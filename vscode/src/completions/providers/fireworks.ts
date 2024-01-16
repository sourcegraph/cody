import * as vscode from 'vscode'

import { type AutocompleteTimeouts } from '@sourcegraph/cody-shared/src/configuration'
import { tokensToChars } from '@sourcegraph/cody-shared/src/prompt/constants'

import { getLanguageConfig } from '../../tree-sitter/language'
import { type CodeCompletionsClient, type CodeCompletionsParams } from '../client'
import { type DocumentContext } from '../get-current-doc-context'
import { CLOSING_CODE_TAG, getHeadAndTail, OPENING_CODE_TAG } from '../text-processing'
import { type InlineCompletionItemWithAnalytics } from '../text-processing/process-inline-completions'
import { type ContextSnippet } from '../types'

import {
    generateCompletions,
    getCompletionParamsAndFetchImpl,
    getLineNumberDependentCompletionParams,
} from './generate-completions'
import {
    Provider,
    standardContextSizeHints,
    type CompletionProviderTracer,
    type ProviderConfig,
    type ProviderOptions,
} from './provider'

export interface FireworksOptions {
    model: FireworksModel
    maxContextTokens?: number
    client: Pick<CodeCompletionsClient, 'complete'>
    timeouts: AutocompleteTimeouts
}

const PROVIDER_IDENTIFIER = 'fireworks'

const EOT_STARCODER = '<|endoftext|>'
const EOT_LLAMA_CODE = ' <EOT>'

// Model identifiers can be found in https://docs.fireworks.ai/explore/ and in our internal
// conversations
const MODEL_MAP = {
    // Models in production
    'starcoder-16b': 'fireworks/starcoder-16b',
    'starcoder-7b': 'fireworks/starcoder-7b',

    // Models in evaluation
    'starcoder-3b': 'fireworks/accounts/fireworks/models/starcoder-3b-w8a16',
    'starcoder-1b': 'fireworks/accounts/fireworks/models/starcoder-1b-w8a16',
    'llama-code-7b': 'fireworks/accounts/fireworks/models/llama-v2-7b-code',
    'llama-code-13b': 'fireworks/accounts/fireworks/models/llama-v2-13b-code',
    'llama-code-13b-instruct': 'fireworks/accounts/fireworks/models/llama-v2-13b-code-instruct',
    'mistral-7b-instruct-4k': 'fireworks/accounts/fireworks/models/mistral-7b-instruct-4k',
}

type FireworksModel =
    | keyof typeof MODEL_MAP
    // `starcoder-hybrid` uses the 16b model for multiline requests and the 7b model for single line
    | 'starcoder-hybrid'

function getMaxContextTokens(model: FireworksModel): number {
    switch (model) {
        case 'starcoder-hybrid':
        case 'starcoder-16b':
        case 'starcoder-7b':
        case 'starcoder-3b':
        case 'starcoder-1b': {
            // StarCoder supports up to 8k tokens, we limit it to ~2k for evaluation against
            // other providers.
            return 2048
        }
        case 'llama-code-7b':
        case 'llama-code-13b':
        case 'llama-code-13b-instruct':
            // Llama Code was trained on 16k context windows, we're constraining it here to better
            // compare the results
            return 2048
        case 'mistral-7b-instruct-4k':
            return 2048
        default:
            return 1200
    }
}

const MAX_RESPONSE_TOKENS = 256

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopRequences: ['\n'],
    multilineStopSequences: ['\n\n', '\n\r\n'],
})

class FireworksProvider extends Provider {
    private model: FireworksModel
    private promptChars: number
    private client: Pick<CodeCompletionsClient, 'complete'>
    private timeouts?: AutocompleteTimeouts

    constructor(options: ProviderOptions, { model, maxContextTokens, client, timeouts }: Required<FireworksOptions>) {
        super(options)
        this.timeouts = timeouts
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
        onCompletionReady: (completion: InlineCompletionItemWithAnalytics[]) => void,
        onHotStreakCompletionReady: (
            docContext: DocumentContext,
            completion: InlineCompletionItemWithAnalytics
        ) => void,
        tracer?: CompletionProviderTracer
    ): Promise<void> {
        const { partialRequestParams, fetchAndProcessCompletionsImpl } = getCompletionParamsAndFetchImpl({
            providerOptions: this.options,
            timeouts: this.timeouts,
            lineNumberDependentCompletionParams,
        })

        const { multiline } = this.options
        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: [{ speaker: 'human', text: this.createPrompt(snippets) }],
            temperature: 0.2,
            topK: 0,
            model:
                this.model === 'starcoder-hybrid'
                    ? MODEL_MAP[multiline ? 'starcoder-16b' : 'starcoder-7b']
                    : MODEL_MAP[this.model],
        }

        await generateCompletions({
            client: this.client,
            requestParams,
            abortSignal,
            providerSpecificPostProcess: this.postProcess,
            providerOptions: this.options,
            tracer,
            fetchAndProcessCompletionsImpl,
            onCompletionReady,
            onHotStreakCompletionReady,
        })
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
        if (this.model === 'mistral-7b-instruct-4k') {
            // This part is copied from the anthropic prompt but fitted into the Mistral instruction format
            const relativeFilePath = vscode.workspace.asRelativePath(this.options.document.fileName)
            const { head, tail } = getHeadAndTail(this.options.docContext.prefix)
            const infillSuffix = this.options.docContext.suffix
            const infillBlock = tail.trimmed.endsWith('{\n') ? tail.trimmed.trimEnd() : tail.trimmed
            const infillPrefix = head.raw
            return `<s>[INST] Below is the code from file path ${relativeFilePath}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:
\`\`\`
${intro}${infillPrefix}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${infillSuffix}
\`\`\`[/INST]
 ${OPENING_CODE_TAG}${infillBlock}`
        }

        console.error('Could not generate infilling prompt for', this.model)
        return `${intro}${prefix}`
    }

    private postProcess = (content: string): string => {
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
    timeouts,
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

    const maxContextTokens = getMaxContextTokens(resolvedModel)

    return {
        create(options: ProviderOptions) {
            return new FireworksProvider(options, {
                model: resolvedModel,
                maxContextTokens,
                timeouts,
                ...otherOptions,
            })
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
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
    return model.startsWith('starcoder')
}

function isLlamaCode(model: string): boolean {
    return model.startsWith('llama-code')
}
