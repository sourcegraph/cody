import { CodeGemma } from './codegemma'
import { CodeLlama } from './codellama'
import { DeepseekCoder } from './deepseek'
import { DefaultModel } from './default'
import { Mistral } from './mistral'
import { StarCoder } from './starcoder'

export * from './default'

export function getModelHelpers(model: string): DefaultModel {
    if (model.includes('codellama') || model.includes('llama-code')) {
        return new CodeLlama()
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

    return new DefaultModel()
}
