import { fetchLocalOllamaModels } from '../llm-providers/ollama/utils'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import type { ModelContextWindow, ModelUsage } from './types'
import { getModelInfo } from './utils'

/**
 * Model describes an LLM model and its capabilities.
 */
export class Model {
    /**
     * Whether the model is the default model for new chats and edits. The user can change their
     * default model.
     */
    public default = false

    // Whether the model is only available to Pro users
    public codyProOnly = false
    // The name of the provider of the model, e.g. "Anthropic"
    public provider: string
    // The title of the model, e.g. "Claude 3 Sonnet"
    public readonly title: string
    // A deprecated model can be used (to not break agent) but won't be rendered
    // in the UI
    public deprecated = false

    constructor(
        /**
         * The model id that includes the provider name & the model name,
         * e.g. "anthropic/claude-3-sonnet-20240229"
         *
         * TODO(PRIME-282): Replace this with a `ModelRef` instance and introduce a separate
         * "modelId" that is distinct from the "modelName". (e.g. "claude-3-sonnet" vs. "claude-3-sonnet-20240229")
         */
        public readonly model: string,
        /**
         * The usage of the model, e.g. chat or edit.
         */
        public readonly usage: ModelUsage[],
        /**
         * The default context window of the model reserved for Chat and Context.
         * {@see TokenCounter on how the token usage is calculated.}
         */
        public readonly contextWindow: ModelContextWindow = {
            input: CHAT_INPUT_TOKEN_BUDGET,
            output: CHAT_OUTPUT_TOKEN_BUDGET,
        },
        /**
         * The client-specific configuration for the model.
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
        },
        public readonly uiGroup?: string
    ) {
        const { provider, title } = getModelInfo(model)
        this.provider = provider
        this.title = title
    }
}

/**
 * ModelsService is the component responsible for keeping track of which models
 * are supported on the backend, which ones are available based on the user's
 * preferences, etc.
 *
 * TODO(PRIME-228): Update this type to be able to fetch the models from the
 *      Sourcegraph backend instead of being hard-coded.
 * TODO(PRIME-283): Enable Cody Enterprise users to select which LLM model to
 *      used in the UI. (By having the relevant code paths just pull the models
 *      from this type.)
 */
export class ModelsService {
    // Unused. Only to work around the linter complaining about a static-only class.
    // When we are fetching data from the Sourcegraph backend, and relying on the
    // current user's credentials, we'll need to turn this into a proper singleton
    // with an initialization step on startup.
    protected ModelsService() {}

    /**
     * Get all the providers currently available to the user
     */
    private static get models(): Model[] {
        return ModelsService.primaryModels.concat(ModelsService.localModels)
    }
    /**
     * Models available on the user's Sourcegraph instance.
     */
    private static primaryModels: Model[] = []
    /**
     * Models available from user's local instances, e.g. Ollama.
     */
    private static localModels: Model[] = []

    public static async onConfigChange(): Promise<void> {
        try {
            ModelsService.localModels = await fetchLocalOllamaModels()
        } catch {
            ModelsService.localModels = []
        }
    }

    /**
     * Sets the primary models available to the user.
     * NOTE: private instances can only support 1 provider ATM.
     */
    public static setModels(providers: Model[]): void {
        ModelsService.primaryModels = providers
    }

    /**
     * Add new models for use.
     */
    public static addModels(providers: Model[]): void {
        const set = new Set(ModelsService.primaryModels)
        for (const provider of providers) {
            set.add(provider)
        }
        ModelsService.primaryModels = Array.from(set)
    }

    /**
     * Get the list of the primary model, augmented with any local ones.
     * If currentModel is provided, sets it as the default model.
     */
    public static getModels(type: ModelUsage, isCodyProUser: boolean, currentModel?: string): Model[] {
        const availableModels = ModelsService.models.filter(m => m.usage.includes(type))

        const currentDefault = currentModel
            ? availableModels.find(m => m.model === currentModel)
            : undefined
        const canUseCurrentDefault = currentDefault?.codyProOnly ? isCodyProUser : !!currentDefault

        return ModelsService.models
            .filter(m => m.usage.includes(type))
            ?.map(model => ({
                ...model,
                // Set the current model as default
                default: canUseCurrentDefault ? model.model === currentModel : model.default,
            }))
    }

    /**
     * Finds the model provider with the given model ID and returns its Context Window.
     */
    public static getContextWindowByID(modelID: string): ModelContextWindow {
        const model = ModelsService.models.find(m => m.model === modelID)
        return model
            ? model.contextWindow
            : { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET }
    }

    public static getModelByID(modelID: string): Model | undefined {
        return ModelsService.models.find(m => m.model === modelID)
    }

    public static getModelByIDSubstringOrError(modelSubstring: string): Model {
        const models = ModelsService.models.filter(m => m.model.includes(modelSubstring))
        if (models.length === 1) {
            return models[0]
        }
        const errorMessage =
            models.length > 1
                ? `Multiple models found for substring ${modelSubstring}.`
                : `No models found for substring ${modelSubstring}.`
        const modelsList = ModelsService.models.map(m => m.model).join(', ')
        throw new Error(`${errorMessage} Available models: ${modelsList}`)
    }
}
