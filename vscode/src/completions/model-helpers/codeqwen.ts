import { type AutocompleteFileContextSnippet, PromptString, ps } from '@sourcegraph/cody-shared'
import { DefaultModel, type FormatIntroSnippetsParams, type FormatPromptParams } from './default'

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

    postProcess(content: string): string {
        return content.replace(EOT_CODEQWEN, '')
    }

    formatIntroSnippets(params: FormatIntroSnippetsParams): PromptString {
        let introPrompt = ps`${PromptString.join(params.intro, ps`\n\n`)}`
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
        const prompt = ps`${intro}<|file_sep|>${fileName}\n<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`
        if (repoName) {
            return ps`<|repo_name|>${repoName}\n${prompt}`
        }
        return prompt
    }
}
