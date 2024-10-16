import type { CodeCompletionsParams } from '@sourcegraph/cody-shared'

import { OpenAI } from '../model-helpers/openai'

import {
    BYOK_MODEL_ID_FOR_LOGS,
    type GenerateCompletionsOptions,
    Provider,
    type ProviderFactoryParams,
} from './shared/provider'

class UnstableOpenAIProvider extends Provider {
    protected modelHelper = new OpenAI()

    public getRequestParams(generateOptions: GenerateCompletionsOptions): CodeCompletionsParams {
        const { document, docContext, snippets } = generateOptions

        const messages = this.modelHelper.getMessages({
            snippets,
            docContext,
            document,
            promptChars: this.promptChars,
        })

        return {
            ...this.defaultRequestParams,
            messages,
            topP: 0.5,
        }
    }
}

export function createProvider({
    legacyModel,
    source,
    configOverwrites,
}: ProviderFactoryParams): Provider {
    return new UnstableOpenAIProvider({
        id: 'unstable-openai',
        legacyModel: legacyModel || BYOK_MODEL_ID_FOR_LOGS,
        source,
        configOverwrites,
    })
}
