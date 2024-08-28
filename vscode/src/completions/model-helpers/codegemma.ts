import { type OllamaGenerateParameters, type PromptString, ps } from '@sourcegraph/cody-shared'
import { DefaultModel, type FormatPromptParams, type GetOllamaPromptParams } from './default'

export class CodeGemma extends DefaultModel {
    stopSequences = [
        '<|fim_prefix|>',
        '<|fim_suffix|>',
        '<|fim_middle|>',
        '<|file_separator|>',
        '<end_of_turn>',
    ]

    getOllamaPrompt(promptContext: GetOllamaPromptParams): PromptString {
        const { context, currentFileNameComment, prefix, suffix } = promptContext

        return ps`${currentFileNameComment}<|fim_prefix|>${context}${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`
    }

    getOllamaRequestOptions(isMultiline: boolean): OllamaGenerateParameters {
        const params = {
            stop: ['\n', ...this.stopSequences],
            temperature: 0.2,
            repeat_penalty: 1.0,
            top_k: -1,
            top_p: -1,
            num_predict: 256,
        }

        if (isMultiline) {
            params.stop = ['\n\n', ...this.stopSequences]
        }

        return params
    }

    formatPrompt(param: FormatPromptParams): PromptString {
        return ps`${param.intro}<|fim_prefix|>${param.prefix}<|fim_suffix|>${param.suffix}<|fim_middle|>`
    }
}
