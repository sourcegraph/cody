import type {
    AutocompleteContextSnippet,
    CodeCompletionsParams,
    DocumentContext,
} from '@sourcegraph/cody-shared'

import { OpenAI } from '../model-helpers/openai'
import {
    CLOSING_CODE_TAG,
    MULTILINE_STOP_SEQUENCE,
    extractFromCodeBlock,
    fixBadCompletionStart,
    trimLeadingWhitespaceUntilNewline,
} from '../text-processing'
import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import {
    type FetchCompletionResult,
    fetchAndProcessDynamicMultilineCompletions,
} from './shared/fetch-and-process-completions'
import {
    type CompletionProviderTracer,
    type GenerateCompletionsOptions,
    Provider,
    type ProviderFactoryParams,
} from './shared/provider'

class UnstableOpenAIProvider extends Provider {
    public stopSequences = [CLOSING_CODE_TAG.toString(), MULTILINE_STOP_SEQUENCE]
    protected modelHelper = new OpenAI()

    public async generateCompletions(
        options: GenerateCompletionsOptions,
        abortSignal: AbortSignal,
        snippets: AutocompleteContextSnippet[],
        tracer?: CompletionProviderTracer
    ): Promise<AsyncGenerator<FetchCompletionResult[]>> {
        const { document, docContext } = options

        const prompt = this.modelHelper.getPrompt({
            snippets,
            docContext,
            document,
            promptChars: this.promptChars,
        })

        const requestParams: CodeCompletionsParams = {
            ...this.defaultRequestParams,
            messages: [{ speaker: 'human', text: prompt }],
            topP: 0.5,
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: options.numberOfCompletionsToGenerate }).map(
            async () => {
                const abortController = forkSignal(abortSignal)

                const completionResponseGenerator = generatorWithTimeout(
                    await this.client.complete(requestParams, abortController),
                    requestParams.timeoutMs,
                    abortController
                )

                return fetchAndProcessDynamicMultilineCompletions({
                    completionResponseGenerator,
                    abortController,
                    providerSpecificPostProcess: this.postProcess(docContext),
                    generateOptions: options,
                })
            }
        )

        return zipGenerators(await Promise.all(completionsGenerators))
    }

    private postProcess =
        (docContext: DocumentContext) =>
        (rawResponse: string): string => {
            let completion = extractFromCodeBlock(rawResponse)

            const trimmedPrefixContainNewline = docContext.prefix
                .slice(docContext.prefix.trimEnd().length)
                .includes('\n')
            if (trimmedPrefixContainNewline) {
                // The prefix already contains a `\n` that LLM was not aware of, so we remove any
                // leading `\n` followed by whitespace that might be add.
                completion = completion.replace(/^\s*\n\s*/, '')
            } else {
                completion = trimLeadingWhitespaceUntilNewline(completion)
            }

            // Remove bad symbols from the start of the completion string.
            completion = fixBadCompletionStart(completion)

            return completion
        }
}

export function createProvider({ legacyModel, provider, source }: ProviderFactoryParams): Provider {
    let clientModel = legacyModel

    if (provider === 'azure-openai' && legacyModel) {
        // Model name for azure openai provider is a deployment name. It shouldn't appear in logs.
        clientModel = ''
    }

    if (provider === 'unstable-openai') {
        // Model is ignored for `unstable-openai` provider
        clientModel = undefined
    }

    return new UnstableOpenAIProvider({
        id: 'unstable-openai',
        legacyModel: clientModel ?? 'gpt-35-turbo',
        source,
    })
}
