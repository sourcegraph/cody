import type { CodeCompletionsParams } from '@sourcegraph/cody-shared'

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

class GoogleGeminiProvider extends Provider {
    public getRequestParams(options: GenerateCompletionsOptions): CodeCompletionsParams {
        const { snippets, docContext, document } = options

        const messages = this.modelHelper.getMessages({
            snippets,
            docContext,
            document,
            promptChars: this.promptChars,
        })

        return {
            ...this.defaultRequestParams,
            topP: 0.95,
            temperature: 0,
            model: `${this.id}/${this.legacyModel}`,
            messages,
        }
    }

    public async generateCompletions(
        generateOptions: GenerateCompletionsOptions,
        abortSignal: AbortSignal,
        tracer?: CompletionProviderTracer
    ): Promise<AsyncGenerator<FetchCompletionResult[]>> {
        const { numberOfCompletionsToGenerate, docContext } = generateOptions

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

const SUPPORTED_GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-pro', 'gemini-1.0-pro'] as const

export function createProvider({ legacyModel, source }: ProviderFactoryParams): Provider {
    const clientModel = legacyModel ?? 'gemini-1.5-flash'

    if (!SUPPORTED_GEMINI_MODELS.some(m => clientModel.includes(m))) {
        throw new Error(`Model ${legacyModel} is not supported by GeminiProvider`)
    }

    return new GoogleGeminiProvider({
        id: 'google',
        legacyModel: clientModel,
        source,
    })
}
