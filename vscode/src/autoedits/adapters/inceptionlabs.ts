import { ps } from '@sourcegraph/cody-shared'

import { getNewLineChar } from '../../completions/text-processing/utils'
import { autoeditsProviderConfig } from '../autoedits-config'
import { autoeditsOutputChannelLogger } from '../output-channel-logger'

import type { AutoeditModelOptions, AutoeditsModelAdapter, ModelResponse } from './base'
import { type AutoeditsRequestBody, getModelResponse, getOpenaiCompatibleChatPrompt } from './utils'

export interface InceptionLabsRequestParams {
    model: string
    temperature: number
}

export const inceptionlabsPrompt = {
    start: ps`The programmer will provide you open files in the editor, recently viewed files, the currently edited file, recent codebase changes, linter errors, and copied content from the codebase. Your task is to rewrite <code_to_rewrite> or add new code to it to match what the programmer will likely do next based on recent edits. Keep your response direct, relevant, and aligned with the existing code patterns. Assume the programmer may have stopped mid-typing or just added a new line. Guidelines for edits: Stay consistent with the detected coding pattern. Output high-quality code. Prioritize continuing the diff history stream, improving code quality, and maintaining focus. Make only necessary changes. Do not skip lines or take shortcuts. The programmer will copy-paste your response directly. <CURSOR_IS_HERE> shows where programmer stopped typing.`,

    end: ps`Based on <diff_history> content, what will I do next? Rewrite the code between <code_to_rewrite> and </code_to_rewrite> based on what I will do next. Remember, you must ONLY respond using the tag: <next-version> with the rewritten code. IMPORTANT: only rewrite the code between <code_to_rewrite> and </code_to_rewrite> tags. Suggest code completions after <CURSOR_IS_HERE> for empty lines. Never output the tag <CURSOR_IS_HERE> in your response.`,
}

/**
 * Experimental inceptionlabs auto-edit adapter for internal dogfooding only.
 */
export class InceptionLabsAdapter implements AutoeditsModelAdapter {
    dispose() {}
    async getModelResponse(option: AutoeditModelOptions): Promise<ModelResponse> {
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
            const response = await getModelResponse({
                apiKey,
                url: option.url,
                body: requestBody,
                abortSignal: option.abortSignal,
            })

            if (response.type === 'aborted') {
                return response
            }

            const newLineChar = getNewLineChar(option.codeToRewrite)
            const prediction = response.responseBody.choices[0].message.content
                .replace(/<next-version>\n?/g, '')
                .replace(/\n?<\/next-version>/g, '')
                // For now manually limit prediction to the same number of lines as the code to rewrite
                .split(newLineChar)
                .slice(0, option.codeToRewrite.split(newLineChar).length)
                .join(newLineChar)

            return {
                ...response,
                prediction,
            }
        } catch (error) {
            autoeditsOutputChannelLogger.logError('getModelResponse', 'Error calling Fireworks API:', {
                verbose: error,
            })
            throw error
        }
    }

    private getMessageBody(options: AutoeditModelOptions): AutoeditsRequestBody {
        const baseParams: InceptionLabsRequestParams = {
            model: options.model,
            temperature: 0,
        }

        return {
            ...baseParams,
            messages: getOpenaiCompatibleChatPrompt({
                // systemMessage: options.prompt.systemMessage,
                userMessage: options.prompt.userMessage,
            }),
        }
    }
}
