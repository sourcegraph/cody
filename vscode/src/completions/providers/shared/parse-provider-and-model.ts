interface ModelInfo {
    provider: string
    legacyModel: string | undefined
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
export function parseProviderAndModel({
    provider,
    legacyModel,
}: ModelInfo): Required<ModelInfo> | Error {
    const delimiter = delimiters[provider]

    if (!delimiter || !legacyModel) {
        return { provider, legacyModel }
    }

    if (legacyModel) {
        const index = legacyModel.indexOf(delimiter)
        const parsedProvider = legacyModel.slice(0, index)
        const parsedModel = legacyModel.slice(index + 1)
        if (parsedProvider && parsedModel) {
            return { provider: parsedProvider, legacyModel: parsedModel }
        }
    }

    return new Error(
        `Failed to parse the model name ${legacyModel} for '${provider}' completions provider.`
    )
}
