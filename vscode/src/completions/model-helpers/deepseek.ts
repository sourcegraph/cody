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

export class DeepseekCoder extends DefaultModel {
    stopSequences = ['<｜fim▁begin｜>', '<｜fim▁hole｜>', '<｜fim▁end｜>, <|eos_token|>']

    getOllamaPrompt(promptContext: GetOllamaPromptParams): PromptString {
        const { context, currentFileNameComment, prefix, suffix } = promptContext

        const infillPrefix = context.concat(currentFileNameComment, prefix)

        return ps`<｜fim▁begin｜>${infillPrefix}<｜fim▁hole｜>${suffix}<｜fim▁end｜>`
    }

    getOllamaRequestOptions(isMultiline: boolean): OllamaGenerateParameters {
        const params = {
            stop: ['\n', ...this.stopSequences],
            temperature: 0.6,
            top_k: 30,
            top_p: 0.2,
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
        return content.replace('<|eos_token|>', '')
    }

    formatIntroSnippets(params: FormatIntroSnippetsParams): PromptString {
        // These model families take code from the context files without comments.
        return ps`${PromptString.join(params.intro, ps`\n\n`)}\n`
    }

    fileSnippetToPromptString(snippet: AutocompleteFileContextSnippet): PromptString {
        const { content } = PromptString.fromAutocompleteContextSnippet(snippet)
        return ps`#${PromptString.fromDisplayPath(snippet.uri)}\n${content}`
    }

    formatPrompt(params: FormatPromptParams): PromptString {
        const { intro, prefix, suffix, repoName, fileName } = params

        // Deepseek paper: https://arxiv.org/pdf/2401.14196
        const prompt = ps`${intro}\n#${fileName}\n<｜fim▁begin｜>${prefix}<｜fim▁hole｜>${suffix}<｜fim▁end｜>`

        if (repoName) {
            return ps`<repo_name>${repoName}\n${prompt}`
        }

        return prompt
    }
}
