import { type AuthStatus, isCodyProUser, isEnterpriseUser } from '../auth/types'
import { fetchLocalOllamaModels } from '../llm-providers/ollama/utils'
import { logDebug, logError } from '../logger'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import { ModelTag } from './tags'
import { type ChatModel, type EditModel, type ModelContextWindow, ModelUsage } from './types'
import { getModelInfo } from './utils'

export type ModelId = string
export type ApiVersionId = string
export type ProviderId = string

export type ModelRefStr = `${ProviderId}::${ApiVersionId}::${ModelId}`
export interface ModelRef {
    providerId: ProviderId
    apiVersionId: ApiVersionId
    modelId: ModelId
}

export type ModelCategory = ModelTag.Accuracy | ModelTag.Balanced | ModelTag.Speed
export type ModelStatus = ModelTag.Experimental | ModelTag.Experimental | 'stable' | ModelTag.Deprecated
export type ModelTier = ModelTag.Free | ModelTag.Pro | ModelTag.Enterprise
export type ModelCapability = 'chat' | 'autocomplete'

export interface ContextWindow {
    maxInputTokens: number
    maxOutputTokens: number
}

type ServerSideConfig = unknown

interface ClientSideConfig {
    /**
     * The API key for the model
     */
    apiKey?: string
    /**
     * The API endpoint for the model
     */
    apiEndpoint?: string
    /**
     * Provider type
     */
    type?: string
}

export interface ServerModel {
    modelRef: ModelRefStr
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
    chat: ModelRefStr
    fastChat: ModelRefStr
    codeCompletion: ModelRefStr
}

// TODO(PRIME-323): Do a proper review of the data model we will use to describe
// server-side configuration. Once complete, it should match the data types we
// use in this repo exactly. Until then, we need to map the "server-side" model
// types, to the `Model` types used by Cody clients.
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
     * TODO(PRIME-282): Replace this with a `ModelRefStr` instance and introduce a separate
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

    public readonly modelRef?: ModelRef

    constructor({
        model,
        modelRef,
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
        // Start by setting the model ref, by default using a new form but falling
        // back to using the old-style of parsing the modelId or using provided fields
        if (typeof modelRef === 'object') {
            this.modelRef = modelRef
        } else if (typeof modelRef === 'string') {
            this.modelRef = Model.parseModelRef(modelRef)
        } else {
            const info = getModelInfo(model)
            this.modelRef = {
                providerId: provider ?? info.provider,
                apiVersionId: 'unknown',
                modelId: title ?? info.title,
            }
        }
        this.model = model
        this.usage = usage
        this.contextWindow = contextWindow
        this.clientSideConfig = clientSideConfig
        this.serverSideConfig = serverSideConfig
        this.tags = tags

        this.provider = this.modelRef.providerId
        this.title = title ?? this.modelRef.modelId
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
        const ref = Model.parseModelRef(modelRef)
        return new Model({
            model: ref.modelId,
            modelRef: ref,
            usage: capabilities.flatMap(capabilityToUsage),
            contextWindow: {
                input: contextWindow.maxInputTokens,
                output: contextWindow.maxOutputTokens,
            },
            // @ts-ignore
            clientSideConfig: clientSideConfig,
            serverSideConfig: serverSideConfig,
            tags: [category, tier],
            provider: ref.providerId,
            title: displayName,
        })
    }

    static tier(model: Model): ModelTier {
        const tierSet = new Set<ModelTag>([ModelTag.Pro, ModelTag.Enterprise])
        return (model.tags.find(tag => tierSet.has(tag)) ?? ModelTag.Free) as ModelTier
    }

    static isCodyPro(model?: Model): boolean {
        return Boolean(model?.tags.includes(ModelTag.Pro))
    }

    static parseModelRef(ref: ModelRefStr): ModelRef {
        // BUG: There is data loss here and the potential for ambiguity.
        // BUG: We are assuming the modelRef is valid, but it might not be.
        try {
            const [providerId, apiVersionId, modelId] = ref.split('::', 3)
            return {
                providerId,
                apiVersionId,
                modelId,
            }
        } catch {
            const [providerId, modelId] = ref.split('/', 2)
            return {
                providerId,
                modelId,
                apiVersionId: 'unknown',
            }
        }
    }
}

interface ModelParams {
    model: string
    modelRef?: ModelRefStr | ModelRef
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
        ModelsService.selectedModels.clear()
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

    private static selectedModels: Map<ModelUsage, Model> = new Map()
    private static defaultModels: Map<ModelUsage, Model> = new Map()

    private static storage: Storage | undefined

    private static selectedStorageKeys = {
        [ModelUsage.Chat]: 'chat',
        [ModelUsage.Edit]: 'editModel',
        [ModelUsage.Autocomplete]: 'autocomplete',
    }

    private static defaultStorageKeys = {
        [ModelUsage.Chat]: 'defaultChatModel',
        [ModelUsage.Edit]: 'defaultEditModel',
        [ModelUsage.Autocomplete]: 'defaultAutocompleteModel',
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
     */
    public static setModels(models: Model[]): void {
        logDebug('ModelsService', `Setting primary models: ${JSON.stringify(models.map(m => m.model))}`)
        ModelsService.primaryModels = models
    }

    /**
     * Sets the primary and default models from the server sent config
     */
    public static async setServerSentModels(config: ServerModelConfiguration): Promise<void> {
        const models = config.models.map(Model.fromApi)
        ModelsService.setModels(models)
        await ModelsService.setServerDefaultModel(ModelUsage.Chat, config.defaultModels.chat)
        await ModelsService.setServerDefaultModel(ModelUsage.Edit, config.defaultModels.chat)
        await ModelsService.setServerDefaultModel(
            ModelUsage.Autocomplete,
            config.defaultModels.codeCompletion
        )
    }

    private static async setServerDefaultModel(usage: ModelUsage, newDefaultModelRef: ModelRefStr) {
        const ref = Model.parseModelRef(newDefaultModelRef)

        // Model should exist as we just set them from the server. If not, something's broken
        const newDefaultModel = ModelsService.resolveModel(newDefaultModelRef)
        if (!newDefaultModel) {
            logError(
                'ModelsService::setServerDefaultModel',
                'Failed to set default model',
                'missing model definition',
                usage,
                newDefaultModelRef
            )
            return
        }

        // If our cached default model matches, nothing needed
        const currentDefaultModel = ModelsService.defaultModels.get(usage)
        if (currentDefaultModel?.model === newDefaultModel.model) {
            return
        }

        // If our stored default model matches, we can update the cache and return
        const storedDefaultModel = ModelsService.storage?.get(ModelsService.defaultStorageKeys[usage])
        if (storedDefaultModel === ref.modelId) {
            ModelsService.defaultModels.set(usage, newDefaultModel)
            return
        }

        // Otherwise the model has updated so we should set it in the in-memory cache
        // as well as the on-disk cache if it exists, and drop any previously selected
        // models for this usage type
        ModelsService.defaultModels.set(usage, newDefaultModel)
        await ModelsService.storage?.set(ModelsService.defaultStorageKeys[usage], newDefaultModel.model)
        ModelsService.selectedModels.delete(usage)
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

    public static getDefaultModel(type: ModelUsage, status: AuthStatus): Model | undefined {
        // Free users can only use the default free model, so we just find the first model they can use
        const models = ModelsService.getModelsByType(type)
        const firstModelUserCanUse = models.find(m => ModelsService.isModelAvailableFor(m, status))

        // Check to see if the user has a selected a default model for this
        // usage type and if not see if there is a server sent default type
        const selected = ModelsService.selectedModels.get(type) ?? ModelsService.defaultModels.get(type)
        if (selected && ModelsService.isModelAvailableFor(selected, status)) {
            return selected
        }

        // If this editor has local storage enabled, check to see if the
        // user set a default model in a previous session.
        const lastSelectedModelID = ModelsService.storage?.get(ModelsService.selectedStorageKeys[type])
        // return either the last selected model or first model they can use if any
        return models.find(m => m.model === lastSelectedModelID) || firstModelUserCanUse
    }

    public static getDefaultEditModel(status: AuthStatus): EditModel | undefined {
        return ModelsService.getDefaultModel(ModelUsage.Edit, status)?.model
    }

    public static getDefaultChatModel(status: AuthStatus): ChatModel | undefined {
        return ModelsService.getDefaultModel(ModelUsage.Chat, status)?.model
    }

    public static async setSelectedModel(type: ModelUsage, model: Model | string): Promise<void> {
        const resolved = ModelsService.resolveModel(model)
        if (!resolved) {
            return
        }
        if (!resolved.usage.includes(type)) {
            throw new Error(`Model "${resolved.model}" is not compatible with usage type "${type}".`)
        }
        logDebug('ModelsService', `Setting selected ${type} model to ${resolved.model}`)
        ModelsService.selectedModels.set(type, resolved)
        // If we have persistent storage set, write it there
        await ModelsService.storage?.set(ModelsService.selectedStorageKeys[type], resolved.model)
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

    // does an approximate match on the model id, seeing if there are any models in the
    // cache that are contained within the given model id. This allows passing a qualified,
    // unqualified or ModelRefStr in as the model id will be a substring
    static resolveModel(modelID: Model | string): Model | undefined {
        if (typeof modelID !== 'string') {
            return modelID
        }

        return ModelsService.models.find(m => modelID.includes(m.model))
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
    delete(key: string): Promise<void>
}

export function capabilityToUsage(capability: ModelCapability): ModelUsage[] {
    switch (capability) {
        case 'autocomplete':
            return [ModelUsage.Autocomplete]
        case 'chat':
            return [ModelUsage.Chat, ModelUsage.Edit]
    }
}
