import type { CodeCompletionsParams } from '@sourcegraph/cody-shared'

import { OpenAI } from '../model-helpers/openai'
import { CLOSING_CODE_TAG, MULTILINE_STOP_SEQUENCE } from '../text-processing'
import { forkSignal, generatorWithTimeout, zipGenerators } from '../utils'

import {
    type FetchCompletionResult,
    fetchAndProcessDynamicMultilineCompletions,
} from './shared/fetch-and-process-completions'
import {
    BYOK_MODEL_ID_FOR_LOGS,
    type CompletionProviderTracer,
    type GenerateCompletionsOptions,
    Provider,
    type ProviderFactoryParams,
} from './shared/provider'

class UnstableOpenAIProvider extends Provider {
    public stopSequences = [CLOSING_CODE_TAG.toString(), MULTILINE_STOP_SEQUENCE]
    protected modelHelper = new OpenAI()

    public getRequestParams(generateOptions: GenerateCompletionsOptions): CodeCompletionsParams {
        const { document, docContext, snippets } = generateOptions

        const messages = this.modelHelper.getMessages({
            snippets,
            docContext,
            document,
            promptChars: this.promptChars,
        })

        return {
            ...this.defaultRequestParams,
            messages,
            topP: 0.5,
        }
    }

    public async generateCompletions(
        generateOptions: GenerateCompletionsOptions,
        abortSignal: AbortSignal,
        tracer?: CompletionProviderTracer
    ): Promise<AsyncGenerator<FetchCompletionResult[]>> {
        const { docContext, numberOfCompletionsToGenerate } = generateOptions

        const requestParams = this.getRequestParams(generateOptions)
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

        return zipGenerators(await Promise.all(completionsGenerators))
    }
}

export function createProvider({ legacyModel, source }: ProviderFactoryParams): Provider {
    return new UnstableOpenAIProvider({
        id: 'unstable-openai',
        legacyModel: legacyModel || BYOK_MODEL_ID_FOR_LOGS,
        source,
    })
}
