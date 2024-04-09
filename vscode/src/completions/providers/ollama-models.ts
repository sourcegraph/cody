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

export interface OllamaModel {
    getPrompt(ollamaPrompt: OllamaPromptContext): string
    getRequestOptions(isMultiline: boolean): OllamaGenerateParameters
}

class DefaultOllamaModel implements OllamaModel {
    getPrompt(ollamaPrompt: OllamaPromptContext): string {
        const { context, currentFileNameComment, prefix } = ollamaPrompt
        return context + currentFileNameComment + prefix
    }

    getRequestOptions(isMultiline: boolean): OllamaGenerateParameters {
        const stop = ['<PRE>', '<SUF>', '<MID>', '<EOT>']

        const params = {
            stop: ['\n', ...stop],
            temperature: 0.2,
            top_k: -1,
            top_p: -1,
            num_predict: 256,
        }

        if (isMultiline) {
            params.stop = ['\n\n', ...stop]
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

    getRequestOptions(isMultiline: boolean): OllamaGenerateParameters {
        const stop = ['<｜fim▁begin｜>', '<｜fim▁hole｜>', '<｜fim▁end｜>']

        const params = {
            stop: ['\n', ...stop],
            temperature: 0.6,
            top_k: 30,
            top_p: 0.2,
            num_predict: 256,
            num_gpu: 99,
            repeat_penalty: 1.1,
        }

        if (isMultiline) {
            params.stop = ['\n\n', ...stop]
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

class StarCoder2 extends DefaultOllamaModel {
    getPrompt(ollamaPrompt: OllamaPromptContext): string {
        const { context, prefix, suffix } = ollamaPrompt

        // `currentFileNameComment` is not included because it causes StarCoder2 to output
        // invalid suggestions.
        const infillPrefix = context + prefix

        return `<fim_prefix>${infillPrefix}<fim_suffix>${suffix}<fim_middle>`
    }

    getRequestOptions(isMultiline: boolean): OllamaGenerateParameters {
        const stop = ['<fim_prefix>', '<fim_suffix>', '<fim_middle>', '<|endoftext|>', '<file_sep>']

        const params = {
            stop: ['\n', ...stop],
            temperature: 0.2,
            top_k: -1,
            top_p: -1,
            num_predict: 256,
        }

        if (isMultiline) {
            params.stop = ['\n\n', ...stop]
        }

        return params
    }
}

class CodeGemma extends DefaultOllamaModel {
    getPrompt(ollamaPrompt: OllamaPromptContext): string {
        const { context, prefix, suffix } = ollamaPrompt
        // c.f. https://huggingface.co/blog/codegemma
        // c.f. https://huggingface.co/google/codegemma-7b/blob/main/tokenizer.json
        return `<|fim_prefix|>${context}${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`
    }

    getRequestOptions(isMultiline: boolean): OllamaGenerateParameters {
        const stop = [
            '<|fim_prefix|>',
            '<|fim_suffix|>',
            '<|fim_middle|>',
            '<|endoftext|>',
            '<|file_separator|>',
        ]

        const params = {
            stop: ['\n', ...stop],
            temperature: 0.2,
            top_k: -1,
            top_p: -1,
            num_predict: 256,
        }

        if (isMultiline) {
            params.stop = ['\n\n', ...stop]
        }

        return params
    }
}

export function getModelHelpers(model: string) {
    if (model.includes('codellama')) {
        return new CodeLlama()
    }

    if (model.includes('deepseek-coder')) {
        return new DeepseekCoder()
    }

    if (model.includes('starcoder2')) {
        return new StarCoder2()
    }

    if (model.includes('codegemma')) {
        return new CodeGemma()
    }

    return new DefaultOllamaModel()
}
