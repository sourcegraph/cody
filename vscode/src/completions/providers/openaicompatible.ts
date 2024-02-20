import * as vscode from 'vscode'

import {
    displayPath,
    tokensToChars,
    type AutocompleteTimeouts,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type CompletionResponseGenerator,
    type ConfigurationWithAccessToken,
} from '@sourcegraph/cody-shared'

import { getLanguageConfig } from '../../tree-sitter/language'
import { CLOSING_CODE_TAG, getHeadAndTail, OPENING_CODE_TAG } from '../text-processing'
import type { ContextSnippet } from '../types'
import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import type { AuthStatus } from '../../chat/protocol'
import type { FetchCompletionResult } from './fetch-and-process-completions'
import {
    getCompletionParamsAndFetchImpl,
    getLineNumberDependentCompletionParams,
} from './get-completion-params'
import {
    Provider,
    standardContextSizeHints,
    type CompletionProviderTracer,
    type ProviderConfig,
    type ProviderOptions,
} from './provider'

export interface OpenAICompatibleOptions {
    model: OpenAICompatibleModel
    maxContextTokens?: number
    client: CodeCompletionsClient
    timeouts: AutocompleteTimeouts
    config: Pick<ConfigurationWithAccessToken, 'accessToken'>
    authStatus: Pick<AuthStatus, 'userCanUpgrade' | 'isDotCom' | 'endpoint'>
}

const PROVIDER_IDENTIFIER = 'openaicompatible'

const EOT_STARCHAT = '<|end|>'
const EOT_STARCODER = '<|endoftext|>'
const EOT_LLAMA_CODE = ' <EOT>'

// Model identifiers (we are the source/definition for these in case of the openaicompatible provider.)
const MODEL_MAP = {
    starchat: 'openaicompatible/starchat-16b-beta',
    'starchat-16b-beta': 'openaicompatible/starchat-16b-beta',

    starcoder: 'openaicompatible/starcoder',
    'starcoder-16b': 'openaicompatible/starcoder-16b',
    'starcoder-7b': 'openaicompatible/starcoder-7b',
    'llama-code-7b': 'openaicompatible/llama-code-7b',
    'llama-code-13b': 'openaicompatible/llama-code-13b',
    'llama-code-13b-instruct': 'openaicompatible/llama-code-13b-instruct',
    'mistral-7b-instruct-4k': 'openaicompatible/mistral-7b-instruct-4k',
}

type OpenAICompatibleModel =
    | keyof typeof MODEL_MAP
    // `starcoder-hybrid` uses the 16b model for multiline requests and the 7b model for single line
    | 'starcoder-hybrid'

function getMaxContextTokens(model: OpenAICompatibleModel): number {
    switch (model) {
        case 'starchat':
        case 'starchat-16b-beta':
        case 'starcoder':
        case 'starcoder-hybrid':
        case 'starcoder-16b':
        case 'starcoder-7b': {
            // StarCoder and StarChat support up to 8k tokens, we limit to ~6k so we do not hit token limits.
            return 8192 - 2048
        }
        case 'llama-code-7b':
        case 'llama-code-13b':
        case 'llama-code-13b-instruct':
            // Llama Code was trained on 16k context windows, we're constraining it here to better
            return 16384 - 2048
        case 'mistral-7b-instruct-4k':
            return 4096 - 2048
        default:
            return 1200
    }
}

const MAX_RESPONSE_TOKENS = 256

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: ['\n'],
    multilineStopSequences: ['\n\n', '\n\r\n'],
})

class OpenAICompatibleProvider extends Provider {
    private model: OpenAICompatibleModel
    private promptChars: number
    private client: CodeCompletionsClient
    private timeouts?: AutocompleteTimeouts

    constructor(
        options: ProviderOptions,
        {
            model,
            maxContextTokens,
            client,
            timeouts,
        }: Required<OpenAICompatibleOptions>
    ) {
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
                    intro.push(
                        `Additional documentation for \`${snippet.symbol}\`:\n\n${snippet.content}`
                    )
                } else {
                    intro.push(
                        `Here is a reference snippet of code from ${displayPath(snippet.uri)}:\n\n${
                            snippet.content
                        }`
                    )
                }
            }

            const introString = `${intro
                .join('\n\n')
                .split('\n')
                .map(line => (languageConfig ? languageConfig.commentStart + line : '// '))
                .join('\n')}\n`

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

    public generateCompletions(
        abortSignal: AbortSignal,
        snippets: ContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        const { partialRequestParams, fetchAndProcessCompletionsImpl } = getCompletionParamsAndFetchImpl(
            {
                providerOptions: this.options,
                timeouts: this.timeouts,
                lineNumberDependentCompletionParams,
            }
        )

        // starchat: Only use infill if the suffix is not empty
        const useInfill = this.options.docContext.suffix.trim().length > 0
        const promptProps: Prompt = {
            snippets: [],
            uri: this.options.document.uri,
            prefix: this.options.docContext.prefix,
            suffix: this.options.docContext.suffix,
            languageId: this.options.document.languageId,
        }

        const prompt = this.model.startsWith('starchat')
            ? promptString(promptProps, useInfill, this.model)
            : this.createPrompt(snippets)

        const { multiline } = this.options
        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: [{ speaker: 'human', text: prompt }],
            temperature: 0.2,
            topK: 0,
            model:
                this.model === 'starcoder-hybrid'
                    ? MODEL_MAP[multiline ? 'starcoder-16b' : 'starcoder-7b']
                    : this.model.startsWith('starchat')
                        ? '' // starchat is not a supported backend model yet, use the default server-chosen model.
                        : MODEL_MAP[this.model],
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: this.options.n }).map(() => {
            const abortController = forkSignal(abortSignal)

            const completionResponseGenerator = generatorWithTimeout(
                this.createDefaultClient(requestParams, abortController),
                requestParams.timeoutMs,
                abortController
            )

            return fetchAndProcessCompletionsImpl({
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
        filename: string,
        intro: string,
        prefix: string,
        suffix: string
    ): string {
        if (isStarCoderFamily(this.model) || isStarChatFamily(this.model)) {
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
        if (isStarChatFamily(this.model)) {
            return content.replace(EOT_STARCHAT, '')
        }
        if (isLlamaCode(this.model)) {
            return content.replace(EOT_LLAMA_CODE, '')
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
}: Omit<OpenAICompatibleOptions, 'model' | 'maxContextTokens'> & {
    model: string | null
}): ProviderConfig {
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
            return new OpenAICompatibleProvider(
                {
                    ...options,
                    id: PROVIDER_IDENTIFIER,
                },
                {
                    model: resolvedModel,
                    maxContextTokens,
                    timeouts,
                    ...otherOptions,
                }
            )
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

function isStarChatFamily(model: string): boolean {
    return model.startsWith('starchat')
}

function isStarCoderFamily(model: string): boolean {
    return model.startsWith('starcoder')
}

function isLlamaCode(model: string): boolean {
    return model.startsWith('llama-code')
}

interface Prompt {
    snippets: { uri: vscode.Uri; content: string }[]

    uri: vscode.Uri
    prefix: string
    suffix: string

    languageId: string
}

function fileNameLine(uri: vscode.Uri, commentStart: string): string {
    return `${commentStart} Path: ${displayPath(uri)}\n`
}

function promptString(prompt: Prompt, infill: boolean, model: string): string {
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
