import { type AuthStatus, isCodyProUser, isEnterpriseUser } from '../auth/types'
import { fetchLocalOllamaModels } from '../llm-providers/ollama/utils'
import { logDebug } from '../logger'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import { ModelTag } from './tags'
import { type ChatModel, type EditModel, type ModelContextWindow, ModelUsage } from './types'
import { getModelInfo } from './utils'

export type ModelId = string
export type ApiVersionId = string
export type ProviderId = string

export type ModelRef = `${ProviderId}::${ApiVersionId}::${ModelId}`

export type ModelCategory = ModelTag.Accuracy | ModelTag.Balanced | ModelTag.Speed
export type ModelStatus = ModelTag.Experimental | ModelTag.Experimental | 'stable' | ModelTag.Deprecated
export type ModelTier = ModelTag.Free | ModelTag.Pro | ModelTag.Enterprise
export type ModelCapability = 'chat' | 'autocomplete'

export interface ContextWindow {
    maxInputTokens: number
    maxOutputTokens: number
}

interface ServerSideConfig {
    /**
     * Provider type
     */
    type?: string
}

interface ClientSideConfig {
    /**
     * The API key for the model
     */
    apiKey?: string
    /**
     * The API endpoint for the model
     */
    apiEndpoint?: string
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
    serverSideConfig?: ServerSideConfig
}

interface Provider {
    id: string
    displayName: string
}

interface DefaultModels {
    chat: ModelRef
    fastChat: ModelRef
    codeCompletion: ModelRef
}

export interface ServerModelConfiguration {
    schemaVersion: string
    revision: string
    providers: Provider[]
    models: ServerModel[]
    defaultModels: DefaultModels
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
    public readonly clientSideConfig?: ClientSideConfig

    /**
     * The server-specific configuration for the model.
     */
    public readonly serverSideConfig?: ServerSideConfig

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
        serverSideConfig,
        tags = [],
        provider,
        title,
    }: ModelParams) {
        this.model = model
        this.usage = usage
        this.contextWindow = contextWindow
        this.clientSideConfig = clientSideConfig
        this.serverSideConfig = serverSideConfig
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
        serverSideConfig,
        contextWindow,
    }: ServerModel) {
        // BUG: There is data loss here and the potential for ambiguity.
        // BUG: We are assuming the modelRef is valid, but it might not be.
        const [providerId, _, modelId] = modelRef.split('::', 3)

        return new Model({
            // NOTE
            model: `${providerId}/${modelId}`,
            usage: capabilities.flatMap(capabilityToUsage),
            contextWindow: {
                input: contextWindow.maxInputTokens,
                output: contextWindow.maxOutputTokens,
            },
            // @ts-ignore
            clientSideConfig: clientSideConfig,
            serverSideConfig: serverSideConfig,
            tags: [category, tier],
            provider: providerId,
            title: displayName,
        })
    }

    static isNewStyleEnterprise(model: Model): boolean {
        return model.tags.includes(ModelTag.Enterprise)
    }

    static tier(model: Model): ModelTier {
        const tierSet = new Set<ModelTag>([ModelTag.Pro, ModelTag.Enterprise])
        return (model.tags.find(tag => tierSet.has(tag)) ?? ModelTag.Free) as ModelTier
    }

    static isCodyPro(model?: Model): boolean {
        return Boolean(model?.tags.includes(ModelTag.Pro))
    }
}

interface ModelParams {
    model: string
    usage: ModelUsage[]
    contextWindow?: ModelContextWindow
    clientSideConfig?: ClientSideConfig
    serverSideConfig?: ServerSideConfig
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

    public static reset() {
        ModelsService.primaryModels = []
        ModelsService.localModels = []
        ModelsService.defaultModels.clear()
        ModelsService.storage = undefined
    }

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
        [ModelUsage.AutoComplete]: 'autocomplete',
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
        logDebug('ModelsService', `Setting primary model: ${JSON.stringify(models.map(m => m.model))}`)
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

    private static getDefaultModel(type: ModelUsage, authStatus: AuthStatus): Model | undefined {
        // Free users can only use the default free model, so we just find the first model they can use
        const models = ModelsService.getModelsByType(type)
        const firstModelUserCanUse = models.find(m => ModelsService.isModelAvailableFor(m, authStatus))
        const current = ModelsService.defaultModels.get(type)
        if (current && ModelsService.isModelAvailableFor(current, authStatus)) {
            return current
        }

        // If this editor has local storage enabled, check to see if the
        // user set a default model in a previous session.
        const lastSelectedModelID = ModelsService.storage?.get(ModelsService.storageKeys[type])
        // return either the last selected model or first model they can use if any
        return models.find(m => m.model === lastSelectedModelID) || firstModelUserCanUse
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
        if (!resolved.usage.includes(type)) {
            throw new Error(`Model "${resolved.model}" is not compatible with usage type "${type}".`)
        }
        logDebug('ModelsService', `Setting default ${type} model to ${resolved.model}`)
        ModelsService.defaultModels.set(type, resolved)
        // If we have persistent storage set, write it there
        await ModelsService.storage?.set(ModelsService.storageKeys[type], resolved.model)
    }

    public static isModelAvailableFor(model: string | Model, status: AuthStatus): boolean {
        const resolved = ModelsService.resolveModel(model)
        if (!resolved) {
            return false
        }
        const tier = Model.tier(resolved)
        // Cody Enterprise users are able to use any models that the backend says is supported.
        if (isEnterpriseUser(status)) {
            return true
        }

        // A Cody Pro user can use any Free or Pro model, but not Enterprise.
        // (But in reality, Sourcegraph.com wouldn't serve any Enterprise-only models to
        // Cody Pro users anyways.)
        if (isCodyProUser(status)) {
            return tier !== 'enterprise'
        }

        return tier === 'free'
    }

    static resolveModel(
        modelID: Model | string,
        customOptions?: ResolveModelOptions
    ): Model | undefined {
        const options = { ...defaultOptions, ...customOptions }
        if (typeof modelID !== 'string') {
            return modelID
        }
        if (options.exact) {
            return ModelsService.models.find(m => m.model === modelID)
        }
        return ModelsService.models.find(m => m.model.includes(modelID))
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

interface ResolveModelOptions {
    exact?: boolean
}

const defaultOptions: ResolveModelOptions = {
    exact: true,
}

interface Storage {
    get(key: string): string | null
    set(key: string, value: string): Promise<void>
}

export function capabilityToUsage(capability: ModelCapability): ModelUsage[] {
    switch (capability) {
        case 'autocomplete':
            return [ModelUsage.AutoComplete]
        case 'chat':
            return [ModelUsage.Chat, ModelUsage.Edit]
    }
}
