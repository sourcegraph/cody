import { fetchLocalOllamaModels } from '../llm-providers/ollama/utils'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import type { ModelTag } from './tags'
import { type ModelContextWindow, ModelUsage } from './types'
import { getModelInfo, isCodyProModel } from './utils'

export type ModelId = string
export type ApiVersionId = string
export type ProviderId = string

export type ModelRef = `${ProviderId}::${ApiVersionId}::${ModelId}`

export type ModelCapability = 'chat' | 'autocomplete'
export type ModelCategory = 'accuracy' | 'balanced' | 'speed'
export type ModelStatus = 'experimental' | 'beta' | 'stable' | 'deprecated'
export type ModelTier = 'free' | 'pro' | 'enterprise'

export interface ContextWindow {
    maxInputTokens: number
    maxOutputTokens: number
}

export interface ServerModel {
    modelRef: ModelRef
    displayName: string
    modelName: string
    capabilities: ModelCapability[]
    category: ModelCategory
    status: ModelStatus
    tier: ModelTier

    contextWindow: ContextWindow

    clientSideConfig?: unknown
}

/**
 * Model describes an LLM model and its capabilities.
 */
export class Model {
    /**
     * Whether the model is the default model for new chats and edits. The user can change their
     * default model.
     */
    public default = false

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

        public readonly tier?: 'free' | 'pro' | 'enterprise',

        // The name of the provider of the model, e.g. "Anthropic"
        public provider?: string,
        // The title of the model, e.g. "Claude 3 Sonnet"
        public readonly title?: string,
        /**
         * The tags assigned for categorizing the model.
         */
        public readonly tags: ModelTag[] = []
    ) {
        if (!provider || !title) {
            const info = getModelInfo(model)
            this.provider = provider ?? info.provider
            this.title = title ?? info.title
        }
    }

    // HACK: Constructor override allowing you to supply the title directly,
    // so it can be different.
    static fromApi({
        modelRef,
        displayName,
        capabilities,
        category,
        tier,
        clientSideConfig,
        contextWindow = {
            maxInputTokens: CHAT_INPUT_TOKEN_BUDGET,
            maxOutputTokens: CHAT_OUTPUT_TOKEN_BUDGET,
        },
    }: ServerModel) {
        // BUG: There is data loss here and the potential for ambiguity.
        // BUG: We are assuming the modelRef is valid, but it might not be.
        const [providerId, _, modelId] = modelRef.split('::', 3)

        return new Model(
            modelId,
            capabilities.flatMap(capabilityToUsage),
            {
                input: contextWindow.maxInputTokens,
                output: contextWindow.maxOutputTokens,
            },
            // @ts-ignore
            clientSideConfig,
            category,
            tier,
            providerId,
            displayName
        )
    }
}

export function isNewStyleEnterpriseModel(model: Model): boolean {
    return model.tier === 'enterprise'
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
    public static setModels(models: Model[]): void {
        ModelsService.primaryModels = models
    }

    /**
     * Add new models for use.
     */
    public static addModels(models: Model[]): void {
        const set = new Set(ModelsService.primaryModels)
        for (const provider of models) {
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
        const canUseCurrentDefault = isCodyProModel(currentDefault) ? isCodyProUser : !!currentDefault

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

export function capabilityToUsage(capability: ModelCapability): ModelUsage[] {
    switch (capability) {
        case 'autocomplete':
            return []
        case 'chat':
            return [ModelUsage.Chat, ModelUsage.Edit]
    }
}
