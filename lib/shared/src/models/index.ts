import { type AuthStatus, isCodyProUser, isEnterpriseUser, isFreeUser } from '../auth/types'
import { fetchLocalOllamaModels } from '../llm-providers/ollama/utils'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import { ModelTag } from './tags'
import { type ChatModel, type EditModel, type ModelContextWindow, ModelUsage } from './types'
import { getModelInfo } from './utils'

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
     * The model id that includes the provider name & the model name,
     * e.g. "anthropic/claude-3-sonnet-20240229"
     *
     * TODO(PRIME-282): Replace this with a `ModelRef` instance and introduce a separate
     * "modelId" that is distinct from the "modelName". (e.g. "claude-3-sonnet" vs. "claude-3-sonnet-20240229")
     */
    public readonly model: string
    /**
     * The usage of the model, e.g. chat or edit.
     */
    public readonly usage: ModelUsage[]
    /**
     * The default context window of the model reserved for Chat and Context.
     * {@see TokenCounter on how the token usage is calculated.}
     */
    public readonly contextWindow: ModelContextWindow

    /**
     * The client-specific configuration for the model.
     */
    public readonly clientSideConfig?: {
        /**
         * The API key for the model
         */
        apiKey?: string
        /**
         * The API endpoint for the model
         */
        apiEndpoint?: string
    }

    // The name of the provider of the model, e.g. "Anthropic"
    public provider: string
    // The title of the model, e.g. "Claude 3 Sonnet"
    public readonly title: string
    /**
     * The tags assigned for categorizing the model.
     */
    public readonly tags: ModelTag[] = []

    constructor({
        model,
        usage,
        contextWindow = {
            input: CHAT_INPUT_TOKEN_BUDGET,
            output: CHAT_OUTPUT_TOKEN_BUDGET,
        },
        clientSideConfig,
        tags = [],
        provider,
        title,
    }: ModelParams) {
        this.model = model
        this.usage = usage
        this.contextWindow = contextWindow
        this.clientSideConfig = clientSideConfig
        this.tags = tags

        const info = getModelInfo(model)
        this.provider = provider ?? info.provider
        this.title = title ?? info.title
    }

    static fromApi({
        modelRef,
        displayName,
        capabilities,
        category,
        tier,
        clientSideConfig,
        contextWindow,
    }: ServerModel) {
        // BUG: There is data loss here and the potential for ambiguity.
        // BUG: We are assuming the modelRef is valid, but it might not be.
        const [providerId, _, modelId] = modelRef.split('::', 3)

        const categoryTag = ((): ModelTag => {
            switch (category) {
                case 'accuracy':
                    return ModelTag.Accuracy
                case 'balanced':
                    return ModelTag.Balanced
                case 'speed':
                    return ModelTag.Speed
            }
        })()

        const tierTag = ((): ModelTag => {
            switch (tier) {
                case 'free':
                    return ModelTag.Free
                case 'pro':
                    return ModelTag.Pro
                case 'enterprise':
                    return ModelTag.Enterprise
            }
        })()

        return new Model({
            model: modelId,
            usage: capabilities.flatMap(capabilityToUsage),
            contextWindow: {
                input: contextWindow.maxInputTokens,
                output: contextWindow.maxOutputTokens,
            },
            // @ts-ignore
            clientSideConfig: clientSideConfig,
            tags: [categoryTag, tierTag],
            provider: providerId,
            title: displayName,
        })
    }

    static isNewStyleEnterprise(model: Model): boolean {
        return model.tags.includes(ModelTag.Enterprise)
    }

    static tier(model: Model): ModelTier {
        if (model.tags.includes(ModelTag.Free)) {
            return 'free'
        }
        if (model.tags.includes(ModelTag.Pro)) {
            return 'pro'
        }
        if (model.tags.includes(ModelTag.Enterprise)) {
            return 'enterprise'
        }

        return 'pro'
    }

    static isCodyPro(model?: Model): boolean {
        return Boolean(model?.tags.includes(ModelTag.Pro))
    }
}

interface ModelParams {
    model: string
    usage: ModelUsage[]
    contextWindow?: ModelContextWindow
    clientSideConfig?: {
        apiKey?: string
        apiEndpoint?: string
    }
    tags?: ModelTag[]
    provider?: string
    title?: string
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

    private static defaultModels: Map<ModelUsage, Model> = new Map()

    private static storage: Storage | undefined

    private static storageKeys = {
        [ModelUsage.Chat]: 'chat',
        [ModelUsage.Edit]: 'editModel',
    }

    public static setStorage(storage: Storage): void {
        ModelsService.storage = storage
    }

    public static async onConfigChange(): Promise<void> {
        try {
            ModelsService.localModels = await fetchLocalOllamaModels()
        } catch {
            ModelsService.localModels = []
        }
    }

    private static getModelsByType(usage: ModelUsage): Model[] {
        return ModelsService.models.filter(model => model.usage.includes(usage))
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
     * Gets the available models of the specified usage type, with the default model first.
     *
     * @param type - The usage type of the models to retrieve.
     * @param authStatus - The authentication status of the user.
     * @returns An array of models, with the default model first.
     */
    public static getModels(type: ModelUsage, authStatus: AuthStatus): Model[] {
        const models = ModelsService.getModelsByType(type)
        const currentModel = ModelsService.getDefaultModel(type, authStatus)
        if (!currentModel) {
            return models
        }
        return [currentModel].concat(models.filter(m => m.model !== currentModel.model))
    }

    public static getDefaultModel(type: ModelUsage, authStatus: AuthStatus): Model | undefined {
        const models = ModelsService.getModelsByType(type)
        const firstModelUserCanUse = models.find(m => ModelsService.canUserUseModel(authStatus, m))
        if (!authStatus.authenticated || isFreeUser(authStatus)) {
            return firstModelUserCanUse
        }
        const current = ModelsService.defaultModels.get(type)
        if (current && ModelsService.canUserUseModel(authStatus, current)) {
            return current
        }

        // Check for the last selected model
        const lastSelectedModelID = ModelsService.storage?.get(ModelsService.storageKeys[type])
        // TODO(jsm): Global migration should happen once in the activation
        // const migratedModelID = migrateAndNotifyForOutdatedModels(lastSelectedModelID)

        // if (migratedModelID && migratedModelID !== lastSelectedModelID) {
        //     void setModel(migratedModelID, storageKey)
        // }

        // return either the last selected model or first model they can use if any
        return (
            models.find(m => m.model === lastSelectedModelID) ||
            models.find(m => ModelsService.canUserUseModel(authStatus, m))
        )
    }

    public static getDefaultEditModel(authStatus: AuthStatus): EditModel | undefined {
        return ModelsService.getDefaultModel(ModelUsage.Edit, authStatus)?.model
    }

    public static getDefaultChatModel(authStatus: AuthStatus): ChatModel | undefined {
        return ModelsService.getDefaultModel(ModelUsage.Chat, authStatus)?.model
    }

    public static async setDefaultModel(type: ModelUsage, model: Model | string): Promise<void> {
        const resolved = ModelsService.resolveModel(model)
        if (!resolved) {
            return
        }
        ModelsService.defaultModels.set(type, resolved)
        // If we have persistent storage set, write it there
        await ModelsService.storage?.set(ModelsService.storageKeys[type], resolved.model)
    }

    public static canUserUseModel(status: AuthStatus, model: string | Model): boolean {
        const resolved = ModelsService.resolveModel(model)
        if (!resolved) {
            return false
        }
        const tier = Model.tier(resolved)
        if (isEnterpriseUser(status)) {
            return tier === 'enterprise'
        }
        if (isCodyProUser(status)) {
            return tier !== 'enterprise'
        }

        return tier === 'free'
    }

    private static resolveModel(modelID: Model | string): Model | undefined {
        if (typeof modelID !== 'string') {
            return modelID
        }
        return ModelsService.models.find(m => m.model === modelID)
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

    public static hasModelTag(model: Model, modelTag: ModelTag): boolean {
        return model.tags.includes(modelTag)
    }
}

interface Storage {
    get(key: string): string | null
    set(key: string, value: string): Promise<void>
}

export function capabilityToUsage(capability: ModelCapability): ModelUsage[] {
    switch (capability) {
        case 'autocomplete':
            return []
        case 'chat':
            return [ModelUsage.Chat, ModelUsage.Edit]
    }
}
