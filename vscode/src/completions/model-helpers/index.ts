import { CodeGemma } from './codegemma'
import { CodeLlama } from './codellama'
import { DeepseekCoder } from './deepseek'
import { DefaultModel } from './default'
import { StarCoder } from './starcoder'

export * from './default'

export function getModelHelpers(model: string): DefaultModel {
    if (model.includes('codellama') || model.includes('llama-code')) {
        return new CodeLlama()
    }

    if (model.includes('deepseek')) {
        return new DeepseekCoder()
    }

    if (model.includes('starcoder')) {
        return new StarCoder()
    }

    if (model.includes('codegemma')) {
        return new CodeGemma()
    }

    return new DefaultModel()
}
