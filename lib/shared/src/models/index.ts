import { DEFAULT_FAST_MODEL_TOKEN_LIMIT } from '../prompt/constants'
import { DEFAULT_DOT_COM_MODELS } from './dotcom'
import type { ModelUsage } from './types'
import { fetchLocalOllamaModels, getModelInfo } from './utils'

/**
 * ModelProvider manages available chat and edit models.
 * It stores a set of available providers and methods to add,
 * retrieve and select between them.
 */
export class ModelProvider {
    // Whether the model is the default model
    public default = false
    // Whether the model is only available to Pro users
    public codyProOnly = false
    // The name of the provider of the model, e.g. "Anthropic"
    public provider: string
    // The title of the model, e.g. "Claude 2.0"
    public readonly title: string

    constructor(
        // The model id that includes the provider name & the model name,
        // e.g. "anthropic/claude-2.0"
        public readonly model: string,
        // The usage of the model, e.g. chat or edit.
        public readonly usage: ModelUsage[],
        // The maximum number of tokens that can be processed by the model in a single request.
        // NOTE: A token is equivalent to 4 characters/bytes.
        public readonly maxToken: number = DEFAULT_FAST_MODEL_TOKEN_LIMIT
    ) {
        const { provider, title } = getModelInfo(model)
        this.provider = provider
        this.title = title
    }

    /**
     * Get all the providers currently available to the user
     */
    private static get providers(): ModelProvider[] {
        return ModelProvider.primaryProviders.concat(ModelProvider.localProviders)
    }
    /**
     * Providers available on the user's Sourcegraph instance
     */
    private static primaryProviders: ModelProvider[] = DEFAULT_DOT_COM_MODELS
    /**
     * Providers available from user's local instances, e.g. Ollama
     */
    private static localProviders: ModelProvider[] = []

    public static async onConfigChange(enableOllamaModels: boolean): Promise<void> {
        // Only fetch local models if user has enabled the config
        ModelProvider.localProviders = enableOllamaModels ? await fetchLocalOllamaModels() : []
    }

    /**
     * Sets the primary model providers.
     * NOTE: private instances can only support 1 provider atm
     */
    public static setProviders(providers: ModelProvider[]): void {
        ModelProvider.primaryProviders = providers
    }

    /**
     * Get the list of the primary models providers with local models.
     * If currentModel is provided, sets it as the default model.
     */
    public static getProviders(
        type: ModelUsage,
        isCodyProUser: boolean,
        currentModel?: string
    ): ModelProvider[] {
        const availableModels = ModelProvider.providers.filter(m => m.usage.includes(type))

        const currentDefault = currentModel
            ? availableModels.find(m => m.model === currentModel)
            : undefined
        const canUseCurrentDefault = currentDefault?.codyProOnly ? isCodyProUser : !!currentDefault

        return ModelProvider.providers
            .filter(m => m.usage.includes(type))
            ?.map(model => ({
                ...model,
                // Set the current model as default
                default: canUseCurrentDefault ? model.model === currentModel : model.default,
            }))
    }

    /**
     * Finds the model provider with the given model ID and returns its characters limit.
     * The limit is calculated based on the max number of tokens the model can process.
     * E.g. 7000 tokens * 4 characters/token = 28000 characters
     */
    public static getMaxTokensByModel(modelID: string): number {
        const model = ModelProvider.providers.find(m => m.model === modelID)
        return model?.maxToken || DEFAULT_FAST_MODEL_TOKEN_LIMIT
    }
}
