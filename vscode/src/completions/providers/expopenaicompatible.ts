// TODO(slimsag): self-hosted-models: deprecate and remove this once customers are upgraded
// to non-experimental version

import {
    type AutocompleteContextSnippet,
    type CodeCompletionsParams,
    PromptString,
    ps,
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

import {
    type FetchCompletionResult,
    fetchAndProcessDynamicMultilineCompletions,
} from './fetch-and-process-completions'
import { getCompletionParams, getLineNumberDependentCompletionParams } from './get-completion-params'
import {
    type CompletionProviderTracer,
    type GenerateCompletionsOptions,
    Provider,
    type ProviderFactoryParams,
} from './provider'

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

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: ['\n'],
    multilineStopSequences: ['\n\n', '\n\r\n'],
})

class ExpOpenAICompatibleProvider extends Provider {
    private createPrompt(
        options: GenerateCompletionsOptions,
        snippets: AutocompleteContextSnippet[]
    ): PromptString {
        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
            options.docContext,
            options.document.uri
        )

        const intro: PromptString[] = []
        let prompt = ps``

        const languageConfig = getLanguageConfig(options.document.languageId)

        // In StarCoder we have a special token to announce the path of the file
        if (!isStarCoderFamily(this.legacyModel)) {
            intro.push(ps`Path: ${PromptString.fromDisplayPath(options.document.uri)}`)
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
                options,
                PromptString.fromDisplayPath(options.document.uri),
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
        options: GenerateCompletionsOptions,
        abortSignal: AbortSignal,
        snippets: AutocompleteContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        const partialRequestParams = getCompletionParams({
            providerOptions: options,
            lineNumberDependentCompletionParams,
        })

        const { prefix, suffix } = PromptString.fromAutocompleteDocumentContext(
            options.docContext,
            options.document.uri
        )

        // starchat: Only use infill if the suffix is not empty
        const useInfill = options.docContext.suffix.trim().length > 0
        const promptProps: Prompt = {
            snippets: [],
            uri: options.document.uri,
            prefix,
            suffix,
            languageId: options.document.languageId,
        }

        const prompt = this.legacyModel.startsWith('starchat')
            ? promptString(promptProps, useInfill, this.legacyModel)
            : this.createPrompt(options, snippets)

        const { multiline } = options
        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: [{ speaker: 'human', text: prompt }],
            temperature: 0.2,
            topK: 0,
            model:
                this.legacyModel === 'starcoder-hybrid'
                    ? MODEL_MAP[multiline ? 'starcoder-16b' : 'starcoder-7b']
                    : this.legacyModel.startsWith('starchat')
                      ? '' // starchat is not a supported backend model yet, use the default server-chosen model.
                      : MODEL_MAP[this.legacyModel as keyof typeof MODEL_MAP],
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: options.numberOfCompletionsToGenerate }).map(
            () => {
                const abortController = forkSignal(abortSignal)

                const completionResponseGenerator = generatorWithTimeout(
                    this.client.complete(requestParams, abortController),
                    requestParams.timeoutMs,
                    abortController
                )

                return fetchAndProcessDynamicMultilineCompletions({
                    completionResponseGenerator,
                    abortController,
                    providerSpecificPostProcess: this.postProcess,
                    generateOptions: options,
                })
            }
        )

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
        options: GenerateCompletionsOptions,
        filename: PromptString,
        intro: PromptString,
        prefix: PromptString,
        suffix: PromptString
    ): PromptString {
        if (isStarCoderFamily(this.legacyModel) || isStarChatFamily(this.legacyModel)) {
            // c.f. https://huggingface.co/bigcode/starcoder#fill-in-the-middle
            // c.f. https://arxiv.org/pdf/2305.06161.pdf
            return ps`<filename>${filename}<fim_prefix>${intro}${prefix}<fim_suffix>${suffix}<fim_middle>`
        }
        if (isLlamaCode(this.legacyModel)) {
            // c.f. https://github.com/facebookresearch/codellama/blob/main/llama/generation.py#L402
            return ps`<PRE> ${intro}${prefix} <SUF>${suffix} <MID>`
        }
        if (this.legacyModel === 'mistral-7b-instruct-4k') {
            // This part is copied from the anthropic prompt but fitted into the Mistral instruction format
            const { head, tail } = getHeadAndTail(prefix)
            const infillBlock = tail.trimmed.toString().endsWith('{\n')
                ? tail.trimmed.trimEnd()
                : tail.trimmed
            const infillPrefix = head.raw
            return ps`<s>[INST] Below is the code from file path ${PromptString.fromDisplayPath(
                options.document.uri
            )}. Review the code outside the XML tags to detect the functionality, formats, style, patterns, and logics in use. Then, use what you detect and reuse methods/libraries to complete and enclose completed code only inside XML tags precisely without duplicating existing implementations. Here is the code:
\`\`\`
${intro}${infillPrefix ? infillPrefix : ''}${OPENING_CODE_TAG}${CLOSING_CODE_TAG}${suffix}
\`\`\`[/INST]
 ${OPENING_CODE_TAG}${infillBlock}`
        }

        console.error('Could not generate infilling prompt for', this.legacyModel)
        return ps`${intro}${prefix}`
    }

    private postProcess = (content: string): string => {
        if (isStarCoderFamily(this.legacyModel)) {
            return content.replace(EOT_STARCODER, '')
        }
        if (isStarChatFamily(this.legacyModel)) {
            return content.replace(EOT_STARCHAT, '')
        }
        if (isLlamaCode(this.legacyModel)) {
            return content.replace(EOT_LLAMA_CODE, '')
        }
        return content
    }
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

    if (model.startsWith('codellama:') && infill) {
        const infillPrefix = context.concat(currentFileNameComment, prompt.prefix)

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
        return ps`<PRE> ${infillPrefix} <SUF>${prompt.suffix} <MID>`
    }

    return context.concat(currentFileNameComment, prompt.prefix)
}

function getClientModel(model?: string): OpenAICompatibleModel {
    if (model === undefined || model === '') {
        return 'starcoder-hybrid' as OpenAICompatibleModel
    }

    if (model === 'starcoder-hybrid' || Object.prototype.hasOwnProperty.call(MODEL_MAP, model)) {
        return model as OpenAICompatibleModel
    }

    throw new Error(`Unknown model: \`${model}\``)
}

export function createProvider(params: ProviderFactoryParams): Provider {
    const { legacyModel, anonymousUserID, source } = params

    const clientModel = getClientModel(legacyModel)

    return new ExpOpenAICompatibleProvider({
        id: 'experimental-openaicompatible',
        legacyModel: clientModel,
        maxContextTokens: getMaxContextTokens(clientModel),
        anonymousUserID,
        source,
    })
}
