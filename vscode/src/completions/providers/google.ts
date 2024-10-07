import type { CodeCompletionsParams } from '@sourcegraph/cody-shared'

import { type GenerateCompletionsOptions, Provider, type ProviderFactoryParams } from './shared/provider'

class GoogleGeminiProvider extends Provider {
    public getRequestParams(options: GenerateCompletionsOptions): CodeCompletionsParams {
        const { snippets, docContext, document } = options

        const messages = this.modelHelper.getMessages({
            snippets,
            docContext,
            document,
            promptChars: this.promptChars,
        })

        return {
            ...this.defaultRequestParams,
            topP: 0.95,
            temperature: 0,
            model: `${this.id}/${this.legacyModel}`,
            messages,
        }
    }
}

const SUPPORTED_GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-pro', 'gemini-1.0-pro'] as const

export function createProvider({
    legacyModel,
    source,
    configOverwrites,
}: ProviderFactoryParams): Provider {
    const clientModel = legacyModel ?? 'gemini-1.5-flash'

    if (!SUPPORTED_GEMINI_MODELS.some(m => clientModel.includes(m))) {
        throw new Error(`Model ${legacyModel} is not supported by GeminiProvider`)
    }

    return new GoogleGeminiProvider({
        id: 'google',
        legacyModel: clientModel,
        source,
        configOverwrites,
    })
}
