import { type OllamaGenerateParameters, PromptString, ps } from '@sourcegraph/cody-shared'
import {
    DefaultModel,
    type FormatPromptParams,
    type GetDefaultIntroSnippetsParams,
    type GetOllamaPromptParams,
} from './default'

export class StarCoder extends DefaultModel {
    stopSequences = ['<fim_prefix>', '<fim_suffix>', '<fim_middle>', '<|endoftext|>', '<file_sep>']

    getOllamaPrompt(promptContext: GetOllamaPromptParams): PromptString {
        const { context, prefix, suffix } = promptContext
        const infillPrefix = context.concat(prefix)
        return ps`<fim_prefix>${infillPrefix}<fim_suffix>${suffix}<fim_middle>`
    }

    getOllamaRequestOptions(isMultiline: boolean): OllamaGenerateParameters {
        const params = {
            stop: ['\n', ...this.stopSequences],
            temperature: 0.2,
            top_k: -1,
            top_p: -1,
            num_predict: 256,
        }

        if (isMultiline) {
            params.stop = ['\n\n', ...this.stopSequences]
        }

        return params
    }

    postProcess(content: string): string {
        return content.replace('<|endoftext|>', '')
    }

    getDefaultIntroSnippets(params: GetDefaultIntroSnippetsParams): PromptString[] {
        const { document, isInfill } = params

        return isInfill ? [] : [ps`Path: ${PromptString.fromDisplayPath(document.uri)}`]
    }

    formatPrompt(params: FormatPromptParams): PromptString {
        const { intro, fileName, prefix, suffix, isInfill } = params

        if (isInfill) {
            // c.f. https://huggingface.co/bigcode/starcoder#fill-in-the-middle
            // c.f. https://arxiv.org/pdf/2305.06161.pdf
            return ps`<filename>${fileName}<fim_prefix>${intro}${prefix}<fim_suffix>${suffix}<fim_middle>`
        }

        return ps`${intro}${prefix}`
    }
}
