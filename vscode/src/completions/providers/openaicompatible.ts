import {
    type AutocompleteContextSnippet,
    type CodeCompletionsParams,
    charsToTokens,
    logError,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import { logDebug } from '../../log'
import {
    type FetchCompletionResult,
    fetchAndProcessDynamicMultilineCompletions,
} from './fetch-and-process-completions'
import {
    MAX_RESPONSE_TOKENS,
    getCompletionParams,
    getLineNumberDependentCompletionParams,
} from './get-completion-params'
import {
    type CompletionProviderTracer,
    type GenerateCompletionsOptions,
    Provider,
    type ProviderFactoryParams,
} from './provider'

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: ['\n\n', '\n\r\n'],
    multilineStopSequences: ['\n\n', '\n\r\n'],
})

class OpenAICompatibleProvider extends Provider {
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

        const { docContext, document } = options

        const prompt = this.modelHelper.getPrompt({
            snippets,
            docContext,
            document,
            promptChars: tokensToChars(this.maxContextTokens - MAX_RESPONSE_TOKENS),
            // StarChat: only use infill if the suffix is not empty
            isInfill: docContext.suffix.trim().length > 0,
        })

        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: [{ speaker: 'human', text: prompt }],
            temperature: 0.2,
            topK: 0,
            model: this.legacyModel,
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
                    providerSpecificPostProcess: this.modelHelper.postProcess,
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
}

export function createProvider(params: ProviderFactoryParams): Provider {
    const { model, anonymousUserID, source } = params

    if (model) {
        logDebug('OpenAICompatible', 'autocomplete provider using model', JSON.stringify(model))

        // TODO(slimsag): self-hosted-models: properly respect ClientSideConfig options in the future
        logDebug('OpenAICompatible', 'note: not all clientSideConfig options are respected yet.')

        // TODO(slimsag): self-hosted-models: lift ClientSideConfig defaults to a standard centralized location
        const maxContextTokens = charsToTokens(
            model.clientSideConfig?.openAICompatible?.contextSizeHintTotalCharacters || 4096
        )

        return new OpenAICompatibleProvider({
            id: 'openaicompatible',
            model,
            maxContextTokens,
            anonymousUserID,
            source,
        })
    }

    logError('createProvider', 'Model definition is missing for `openaicompatible` provider.')
    throw new Error('Model definition is missing for `openaicompatible` provider.')
}
