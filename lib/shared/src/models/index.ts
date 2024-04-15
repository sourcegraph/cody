import { fetchLocalOllamaModels } from '../llm-providers/ollama/utils'
import {
    DEFAULT_CHAT_MODEL_INPUT_TOKEN_LIMIT,
    DEFAULT_CHAT_MODEL_OUTPUT_TOKEN_LIMIT,
    tokensToChars,
} from '../prompt/constants'
import type { ModelUsage } from './types'
import { getModelInfo } from './utils'

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
        /**
         * The context window of the model, which is the maximum number of tokens
         * that can be processed by the model in a single request.
         */
        public readonly maxInputToken: number = DEFAULT_CHAT_MODEL_INPUT_TOKEN_LIMIT,
        /**
         * The maximum number of tokens that the model can respond with in a single request.
         */
        public readonly maxOutputToken: number = DEFAULT_CHAT_MODEL_OUTPUT_TOKEN_LIMIT,
        /**
         * The configuration for the model.
         */
        public readonly config?: {
            /**
             * The API key for the model
             */
            apiKey?: string
            /**
             * The API endpoint for the model
             */
            apiEndpoint?: string
        }
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
    private static primaryProviders: ModelProvider[] = []
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
     * Add new providers as primary model providers.
     */
    public static addProviders(providers: ModelProvider[]): void {
        const set = new Set(ModelProvider.primaryProviders)
        for (const provider of providers) {
            set.add(provider)
        }
        ModelProvider.primaryProviders = Array.from(set)
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
     * Finds the model provider with the given model ID and returns its input character limit.
     * The limit is calculated based on the max number of tokens the model can receive.
     * E.g. 7000 tokens * 4 characters/token = 28000 characters
     */
    public static getMaxInputCharsByModel(modelID: string): number {
        const model = ModelProvider.providers.find(m => m.model === modelID)
        return tokensToChars(model?.maxInputToken || DEFAULT_CHAT_MODEL_INPUT_TOKEN_LIMIT)
    }

    /**
     * Finds the model provider with the given model ID and returns its output character limit.
     * The limit is calculated based on the max number of tokens the model can output.
     * E.g. 7000 tokens * 4 characters/token = 28000 characters
     */
    public static getMaxOutputCharsByModel(modelID: string): number {
        const model = ModelProvider.providers.find(m => m.model === modelID)
        return tokensToChars(model?.maxOutputToken || DEFAULT_CHAT_MODEL_OUTPUT_TOKEN_LIMIT)
    }

    public static getProviderByModel(modelID: string): ModelProvider | undefined {
        return ModelProvider.providers.find(m => m.model === modelID)
    }
}
