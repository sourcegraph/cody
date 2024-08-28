import {
    type AuthStatus,
    type AutocompleteContextSnippet,
    type ClientConfigurationWithAccessToken,
    type CodeCompletionsClient,
    type CodeCompletionsParams,
    type Model,
    charsToTokens,
    tokensToChars,
} from '@sourcegraph/cody-shared'

import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import { logDebug } from '../../log'
import { type DefaultModel, getModelHelpers } from '../model-helpers'
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
    Provider,
    type ProviderConfig,
    type ProviderOptions,
    standardContextSizeHints,
} from './provider'

interface OpenAICompatibleOptions {
    model: Model
    maxContextTokens?: number
    client: CodeCompletionsClient
    config: Pick<ClientConfigurationWithAccessToken, 'accessToken'>
    authStatus: Pick<AuthStatus, 'userCanUpgrade' | 'isDotCom' | 'endpoint'>
}

const lineNumberDependentCompletionParams = getLineNumberDependentCompletionParams({
    singlelineStopSequences: ['\n\n', '\n\r\n'],
    multilineStopSequences: ['\n\n', '\n\r\n'],
})

const PROVIDER_IDENTIFIER = 'openaicompatible'

class OpenAICompatibleProvider extends Provider {
    private model: Model
    private promptChars: number
    private client: CodeCompletionsClient
    private modelHelper: DefaultModel

    constructor(
        options: ProviderOptions,
        { model, maxContextTokens, client }: Required<OpenAICompatibleOptions>
    ) {
        super(options)
        this.model = model
        this.promptChars = tokensToChars(maxContextTokens - MAX_RESPONSE_TOKENS)
        this.client = client
        this.modelHelper = getModelHelpers(model.id)
    }

    public generateCompletions(
        abortSignal: AbortSignal,
        snippets: AutocompleteContextSnippet[],
        tracer?: CompletionProviderTracer
    ): AsyncGenerator<FetchCompletionResult[]> {
        const partialRequestParams = getCompletionParams({
            providerOptions: this.options,
            lineNumberDependentCompletionParams,
        })

        const prompt = this.modelHelper.getPrompt({
            snippets,
            docContext: this.options.docContext,
            document: this.options.document,
            promptChars: this.promptChars,
            // StarChat: only use infill if the suffix is not empty
            isInfill: this.options.docContext.suffix.trim().length > 0,
        })

        const requestParams: CodeCompletionsParams = {
            ...partialRequestParams,
            messages: [{ speaker: 'human', text: prompt }],
            temperature: 0.2,
            topK: 0,
            model: this.model.id,
        }

        tracer?.params(requestParams)

        const completionsGenerators = Array.from({ length: this.options.n }).map(() => {
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
}

export function createProviderConfig({
    model,
    ...otherOptions
}: Omit<OpenAICompatibleOptions, 'maxContextTokens'>): ProviderConfig {
    logDebug('OpenAICompatible', 'autocomplete provider using model', JSON.stringify(model))

    // TODO(slimsag): self-hosted-models: properly respect ClientSideConfig options in the future
    logDebug('OpenAICompatible', 'note: not all clientSideConfig options are respected yet.')

    // TODO(slimsag): self-hosted-models: lift ClientSideConfig defaults to a standard centralized location
    const maxContextTokens = charsToTokens(
        model.clientSideConfig?.openAICompatible?.contextSizeHintTotalCharacters || 4096
    )

    return {
        create(options: ProviderOptions) {
            return new OpenAICompatibleProvider(
                {
                    ...options,
                    id: PROVIDER_IDENTIFIER,
                },
                {
                    model,
                    maxContextTokens,
                    ...otherOptions,
                }
            )
        },
        contextSizeHints: standardContextSizeHints(maxContextTokens),
        identifier: PROVIDER_IDENTIFIER,
        model: model.id,
    }
}
