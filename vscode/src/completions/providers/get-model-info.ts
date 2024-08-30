import { type AuthStatus, type Model, ModelUsage, modelsService } from '@sourcegraph/cody-shared'

interface ModelInfo {
    provider: string
    modelId?: string
    model?: Model
}

export function getModelInfo(authStatus: AuthStatus): ModelInfo | Error {
    const model = modelsService.instance!.getDefaultModel(ModelUsage.Autocomplete)

    if (model) {
        let provider = model.provider
        if (model.clientSideConfig?.openAICompatible) {
            provider = 'openaicompatible'
        }
        return { provider, modelId: model.id, model }
    }

    if (authStatus.configOverwrites?.provider) {
        return parseProviderAndModel({
            provider: authStatus.configOverwrites.provider,
            modelId: authStatus.configOverwrites.completionModel,
        })
    }

    // Fail with error if no `completionModel` is configured.
    return new Error(
        'Failed to get autocomplete model info. Please configure the `completionModel` using site configuration.'
    )
}

const delimiters: Record<string, string> = {
    sourcegraph: '/',
    'aws-bedrock': '.',
}

/**
 * For certain completions providers configured in the Sourcegraph instance site config
 * the model name consists MODEL_PROVIDER and MODEL_NAME separated by a specific delimiter (see {@link delimiters}).
 *
 * This function checks if the given provider has a specific model naming format and:
 *   - if it does, parses the model name and returns the parsed provider and model names;
 *   - if it doesn't, returns the original provider and model names.
 *
 * E.g. for "sourcegraph" provider the completions model name consists of model provider and model name separated by "/".
 * So when received `{ provider: "sourcegraph", model: "anthropic/claude-instant-1" }` the expected output would be `{ provider: "anthropic", model: "claude-instant-1" }`.
 */
function parseProviderAndModel({ provider, modelId }: ModelInfo): ModelInfo | Error {
    const delimiter = delimiters[provider]
    if (!delimiter) {
        return { provider, modelId }
    }

    if (modelId) {
        const index = modelId.indexOf(delimiter)
        const parsedProvider = modelId.slice(0, index)
        const parsedModel = modelId.slice(index + 1)
        if (parsedProvider && parsedModel) {
            return { provider: parsedProvider, modelId: parsedModel }
        }
    }

    return new Error(
        (modelId
            ? `Failed to parse the model name ${modelId}`
            : `Model missing but delimiter ${delimiter} expected`) +
            `for '${provider}' completions provider.`
    )
}
