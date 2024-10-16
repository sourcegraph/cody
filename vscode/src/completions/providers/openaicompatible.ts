import { type CodeCompletionsParams, charsToTokens, logError } from '@sourcegraph/cody-shared'

import { logDebug } from '../../output-channel-logger'

import { type GenerateCompletionsOptions, Provider, type ProviderFactoryParams } from './shared/provider'

class OpenAICompatibleProvider extends Provider {
    public getRequestParams(options: GenerateCompletionsOptions): CodeCompletionsParams {
        const { docContext, document, snippets } = options

        const messages = this.modelHelper.getMessages({
            snippets,
            docContext,
            document,
            promptChars: this.promptChars,
            // StarChat: only use infill if the suffix is not empty
            isInfill: docContext.suffix.trim().length > 0,
        })

        return {
            ...this.defaultRequestParams,
            messages,
        }
    }
}

export function createProvider({ model, source, configOverwrites }: ProviderFactoryParams): Provider {
    if (model) {
        logDebug('OpenAICompatible', 'autocomplete provider using model', JSON.stringify(model))

        // TODO(slimsag): self-hosted-models: properly respect ClientSideConfig generateOptions in the future
        logDebug('OpenAICompatible', 'note: not all clientSideConfig generateOptions are respected yet.')

        // TODO(slimsag): self-hosted-models: lift ClientSideConfig defaults to a standard centralized location
        const maxContextTokens = charsToTokens(
            model.clientSideConfig?.openAICompatible?.contextSizeHintTotalCharacters || 4096
        )

        return new OpenAICompatibleProvider({
            id: 'openaicompatible',
            model,
            maxContextTokens,
            source,
            configOverwrites,
        })
    }

    logError('createProvider', 'Model definition is missing for `openaicompatible` provider.')
    throw new Error('Model definition is missing for `openaicompatible` provider.')
}
