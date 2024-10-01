import {
    type AutocompleteFileContextSnippet,
    type OllamaGenerateParameters,
    PromptString,
    ps,
} from '@sourcegraph/cody-shared'
import {
    DefaultModel,
    type FormatIntroSnippetsParams,
    type FormatPromptParams,
    type GetOllamaPromptParams,
} from './default'

const EOT_CODEQWEN = '<|endoftext|>'

export class CodeQwen extends DefaultModel {
    stopSequences = [
        '<|repo_name|>',
        '<|file_sep|>',
        '<|fim_prefix|>',
        '<|fim_suffix|>',
        '<|fim_middle|>',
        EOT_CODEQWEN,
    ]

    getOllamaPrompt(promptContext: GetOllamaPromptParams): PromptString {
        const { context, currentFileNameComment, prefix, suffix } = promptContext

        const infillPrefix = context.concat(currentFileNameComment, prefix)

        return ps`<|fim_prefix|>${infillPrefix}<|fim_suffix|>${suffix}<|fim_middle|>`
    }

    getOllamaRequestOptions(isMultiline: boolean): OllamaGenerateParameters {
        const params = {
            stop: ['\n', ...this.stopSequences],
            temperature: 0.2,
            top_k: 40,
            top_p: 0.8,
            num_predict: 256,
            num_gpu: 99,
            repeat_penalty: 1.1,
        }

        if (isMultiline) {
            params.stop = ['\n\n', ...this.stopSequences]
        }

        return params
    }

    postProcess(content: string): string {
        return content.replace(EOT_CODEQWEN, '')
    }

    formatIntroSnippets(params: FormatIntroSnippetsParams): PromptString {
        let introPrompt = ps`${PromptString.join(params.intro, ps`\n`)}`
        if (introPrompt.length > 0) {
            introPrompt = ps`${introPrompt}\n`
        }
        return introPrompt
    }

    fileSnippetToPromptString(snippet: AutocompleteFileContextSnippet): PromptString {
        const { content } = PromptString.fromAutocompleteContextSnippet(snippet)
        return ps`<|file_sep|>${PromptString.fromDisplayPath(snippet.uri)}\n${content}`
    }

    formatPrompt(params: FormatPromptParams): PromptString {
        // Prompt format for CodeQwen in technical report: https://arxiv.org/pdf/2409.12186
        const { intro, prefix, suffix, repoName, fileName } = params
        let introPrefix = ps``
        if (intro.length > 0) {
            introPrefix = ps`${intro}\n`
        }
        const prompt = ps`${intro}<|file_sep|>${fileName}\n<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`
        if (repoName) {
            return ps`<|repo_name|>${repoName}\n${prompt}`
        }
        return prompt
    }
}
