import { ps } from '@sourcegraph/cody-shared'

import { forkSignal, generatorWithErrorObserver, generatorWithTimeout } from '../../completions/utils'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'
import type { AutoeditModelOptions, AutoeditsModelAdapter, ModelResponse } from './base'
import { getDefaultModelResponse } from './model-response/default'
import { getMaxOutputTokensForAutoedits } from './utils'
import { type AutoeditsRequestBody, getOpenaiCompatibleChatPrompt } from './utils'

export interface InceptionLabsRequestParams {
    model: string
    temperature: number
    max_tokens: number
    stop?: string[]
}

export const inceptionlabsPrompt = {
    system: ps`You are Mercury, created by Inception Labs. You are an intelligent programmer and an expert at coding. Your goal is to help a colleague finish a code change.`,
}

/**
 * Experimental inceptionlabs auto-edit adapter for internal dogfooding only.
 */
export class InceptionLabsAdapter implements AutoeditsModelAdapter {
    dispose() {}

    private readonly defaultTimeoutMs = 5000

    async getModelResponse(option: AutoeditModelOptions): Promise<AsyncGenerator<ModelResponse>> {
        const requestBody = this.getMessageBody(option)
        try {
            const apiKey = autoeditsProviderConfig.experimentalAutoeditsConfigOverride?.apiKey

            if (!apiKey) {
                autoeditsOutputChannelLogger.logError(
                    'getModelResponse',
                    'No api key provided in the config override'
                )
                throw new Error('No api key provided in the config override')
            }

            const abortController = forkSignal(option.abortSignal)
            return generatorWithErrorObserver(
                generatorWithTimeout(
                    getDefaultModelResponse({
                        apiKey,
                        url: option.url,
                        body: requestBody,
                        abortSignal: option.abortSignal,
                        extractPrediction: (response: any) => {
                            const responseParsed = response.choices[0].message.content.startsWith(
                                '<|editable_region_start|>\n'
                            )
                                ? response.choices[0].message.content.substring(
                                      '<|editable_region_start|>\n'.length
                                  )
                                : response.choices[0].message.content
                            return responseParsed
                        },
                    }),
                    option.timeoutMs ?? this.defaultTimeoutMs,
                    abortController
                ),
                error => {
                    autoeditsOutputChannelLogger.logError(
                        'getModelResponse',
                        'Error calling Inceptionlabs API:',
                        {
                            verbose: error,
                        }
                    )
                    throw error
                }
            )
        } catch (error) {
            autoeditsOutputChannelLogger.logError(
                'getModelResponse',
                'Error calling Inceptionlabs API:',
                {
                    verbose: error,
                }
            )
            throw error
        }
    }

    private getMessageBody(options: AutoeditModelOptions): AutoeditsRequestBody {
        const maxTokens = getMaxOutputTokensForAutoedits(options.codeToRewrite)
        const baseParams: InceptionLabsRequestParams = {
            model: options.model,
            temperature: 0.1,
            max_tokens: maxTokens,
            stop: ['<|editable_region_end|>'],
        }

        return {
            ...baseParams,
            messages: getOpenaiCompatibleChatPrompt({
                systemMessage: inceptionlabsPrompt.system,
                userMessage: options.prompt.userMessage,
            }),
        }
    }
}
