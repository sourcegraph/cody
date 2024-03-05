import type * as vscode from 'vscode'

import type { OllamaGenerateParameters } from '@sourcegraph/cody-shared'

interface OllamaPromptContext {
    snippets: { uri: vscode.Uri; content: string }[]
    context: string
    currentFileNameComment: string
    isInfill: boolean

    uri: vscode.Uri
    prefix: string
    suffix: string

    languageId: string
}

const EOT_TOKEN = '<EOT>'
const SHARED_STOP_SEQUENCES = [
    '// Path:',
    '\u001E',
    '\u001C',
    EOT_TOKEN,

    // Tokens that reduce the quality of multi-line completions but improve performance.
    '; ',
    ';\t',
]
const SINGLE_LINE_STOP_SEQUENCES = ['\n', ...SHARED_STOP_SEQUENCES]
// TODO(valery): find the balance between using less stop tokens to get more multiline completions and keeping a good perf.
// `SHARED_STOP_SEQUENCES` are not included because the number of multiline completions goes down significantly
// leaving an impression that Ollama provider support only singleline completions.
const MULTI_LINE_STOP_SEQUENCES: string[] = ['\n\n', EOT_TOKEN /* ...SHARED_STOP_SEQUENCES */]

export interface OllamaModel {
    getPrompt(ollamaPrompt: OllamaPromptContext): string
    getRequestOptions(isMultiline: boolean, isDynamicMultiline: boolean): OllamaGenerateParameters
}

class DefaultOllamaModel implements OllamaModel {
    getPrompt(ollamaPrompt: OllamaPromptContext): string {
        const { context, currentFileNameComment, prefix } = ollamaPrompt
        return context + currentFileNameComment + prefix
    }

    getRequestOptions(isMultiline: boolean, isDynamicMultiline: boolean): OllamaGenerateParameters {
        const params = {
            stop: SINGLE_LINE_STOP_SEQUENCES,
            temperature: 0.2,
            top_k: -1,
            top_p: -1,
            num_predict: 30,
        }

        if (isMultiline) {
            Object.assign(params, {
                num_predict: 256,
                stop: MULTI_LINE_STOP_SEQUENCES,
            })
        }

        if (isDynamicMultiline) {
            params.stop = []
        }

        return params
    }
}

class DeepseekCoder extends DefaultOllamaModel {
    getPrompt(ollamaPrompt: OllamaPromptContext): string {
        const { context, currentFileNameComment, prefix, suffix } = ollamaPrompt

        const infillPrefix = context + currentFileNameComment + prefix

        return `<｜fim▁begin｜>${infillPrefix}<｜fim▁hole｜>${suffix}<｜fim▁end｜>`
    }

    getRequestOptions(isMultiline: boolean, isDynamicMultiline: boolean): OllamaGenerateParameters {
        const params = {
            stop: SINGLE_LINE_STOP_SEQUENCES,
            temperature: 0.6,
            top_k: 30,
            top_p: 0.2,
            num_predict: 30,
            num_gpu: 99,
            repeat_penalty: 1.1,
        }

        if (isMultiline) {
            Object.assign(params, {
                num_predict: -1,
                stop: MULTI_LINE_STOP_SEQUENCES,
            })
        }

        if (isDynamicMultiline) {
            Object.assign(params, {
                num_predict: -1,
                stop: [],
            })
        }

        return params
    }
}

class CodeLlama extends DefaultOllamaModel {
    getPrompt(ollamaPrompt: OllamaPromptContext): string {
        const { context, currentFileNameComment, prefix, suffix, isInfill } = ollamaPrompt

        if (isInfill) {
            const infillPrefix = context + currentFileNameComment + prefix

            /**
             * The infill prompt for Code Llama.
             * Source: https://github.com/facebookresearch/codellama/blob/e66609cfbd73503ef25e597fd82c59084836155d/llama/generation.py#L418
             *
             * Why are there spaces left and right?
             * > For instance, the model expects this format: `<PRE> {pre} <SUF>{suf} <MID>`.
             * But you won’t get infilling if the last space isn’t added such as in `<PRE> {pre} <SUF>{suf}<MID>`
             *
             * Source: https://blog.fireworks.ai/simplifying-code-infilling-with-code-llama-and-fireworks-ai-92c9bb06e29c
             */
            return `<PRE> ${infillPrefix} <SUF>${suffix} <MID>`
        }

        return context + currentFileNameComment + prefix
    }
}

class StarCoder extends DefaultOllamaModel {
    getPrompt(ollamaPrompt: OllamaPromptContext): string {
        const { context, currentFileNameComment, prefix, suffix } = ollamaPrompt

        const infillPrefix = context + currentFileNameComment + prefix

        return `<fim_prefix>${infillPrefix}<fim_suffix>${suffix}<fim_middle>`
    }
}

export function getModelHelpers(model: string) {
    if (model.includes('codellama')) {
        return new CodeLlama()
    }

    if (model.includes('deepseek-coder')) {
        return new DeepseekCoder()
    }

    if (model.includes('starcoder')) {
        return new StarCoder()
    }

    return new DefaultOllamaModel()
}
