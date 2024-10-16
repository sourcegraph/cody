import { Claude } from './claude'
import { CodeGemma } from './codegemma'
import { CodeLlama } from './codellama'
import { CodeQwen } from './codeqwen'
import { DeepseekCoder } from './deepseek'
import { DefaultModel } from './default'
import { Gemini } from './gemini'
import { Mistral } from './mistral'
import { StarCoder } from './starcoder'

export * from './default'

export function getModelHelpers(model: string): DefaultModel {
    if (model.includes('codellama') || model.includes('llama-code')) {
        return new CodeLlama()
    }

    if (model.includes('code-qwen')) {
        return new CodeQwen()
    }

    if (model.includes('deepseek')) {
        return new DeepseekCoder()
    }

    // "StarChat is a series of language models that are fine-tuned from StarCoder to act as helpful coding assistants."
    // Source: https://huggingface.co/HuggingFaceH4/starchat-alpha
    //
    // That's why we use the StarCoder model-helper here.
    if (model.includes('starcoder') || model.includes('starchat')) {
        return new StarCoder()
    }

    if (model.includes('mistral') || model.includes('mixtral')) {
        return new Mistral()
    }

    if (model.includes('codegemma')) {
        return new CodeGemma()
    }

    if (model.includes('gemini')) {
        return new Gemini()
    }

    if (model.includes('claude')) {
        return new Claude()
    }

    return new DefaultModel()
}
