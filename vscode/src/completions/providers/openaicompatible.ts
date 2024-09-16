import {
    type AutocompleteContextSnippet,
    type CodeCompletionsParams,
    charsToTokens,
    logError,
} from '@sourcegraph/cody-shared'

import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import { logDebug } from '../../log'
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

class OpenAICompatibleProvider extends Provider {
    public async generateCompletions(
        generateOptions: GenerateCompletionsOptions,
        abortSignal: AbortSignal,
        snippets: AutocompleteContextSnippet[],
        tracer?: CompletionProviderTracer
    ): Promise<AsyncGenerator<FetchCompletionResult[]>> {
        const { docContext, document, numberOfCompletionsToGenerate } = generateOptions

        const prompt = this.modelHelper.getPrompt({
            snippets,
            docContext,
            document,
            promptChars: this.promptChars,
            // StarChat: only use infill if the suffix is not empty
            isInfill: docContext.suffix.trim().length > 0,
        })

        const requestParams: CodeCompletionsParams = {
            ...this.defaultRequestParams,
            messages: [{ speaker: 'human', text: prompt }],
            model: this.legacyModel,
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: numberOfCompletionsToGenerate }).map(
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
                    generateOptions,
                    providerSpecificPostProcess: content =>
                        this.modelHelper.postProcess(content, docContext),
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
        return zipGenerators(await Promise.all(completionsGenerators))
    }
}

export function createProvider({ model, source }: ProviderFactoryParams): Provider {
    if (model) {
        logDebug('OpenAICompatible', 'autocomplete provider using model', JSON.stringify(model))

        // TODO(slimsag): self-hosted-models: properly respect ClientSideConfig generateOptions in the future
        logDebug('OpenAICompatible', 'note: not all clientSideConfig generateOptions are respected yet.')

        // TODO(slimsag): self-hosted-models: lift ClientSideConfig defaults to a standard centralized location
        const maxContextTokens = charsToTokens(
            model.clientSideConfig?.openAICompatible?.contextSizeHintTotalCharacters || 4096
        )

        return new OpenAICompatibleProvider({
            id: 'openaicompatible',
            model,
            maxContextTokens,
            source,
        })
    }

    logError('createProvider', 'Model definition is missing for `openaicompatible` provider.')
    throw new Error('Model definition is missing for `openaicompatible` provider.')
}
