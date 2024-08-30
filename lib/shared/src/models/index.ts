import { type AuthStatus, isCodyProUser, isEnterpriseUser } from '../auth/types'
import { type ClientConfiguration, CodyIDE } from '../configuration'
import { fetchLocalOllamaModels } from '../llm-providers/ollama/utils'
import { logDebug, logError } from '../logger'
import { setSingleton, singletonNotYetSet } from '../singletons'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import { ModelTag } from './tags'
import { type ChatModel, type EditModel, type ModelContextWindow, ModelUsage } from './types'
import { getModelInfo } from './utils'

type ModelId = string
type ApiVersionId = string
type ProviderId = string

type ModelRefStr = `${ProviderId}::${ApiVersionId}::${ModelId}`
interface ModelRef {
    providerId: ProviderId
    apiVersionId: ApiVersionId
    modelId: ModelId
}

export type ModelCategory = ModelTag.Power | ModelTag.Balanced | ModelTag.Speed
type ModelStatus = ModelTag.Experimental | ModelTag.Experimental | 'stable' | ModelTag.Deprecated
export type ModelTier = ModelTag.Free | ModelTag.Pro | ModelTag.Enterprise
type ModelCapability = 'chat' | 'autocomplete'

interface ContextWindow {
    maxInputTokens: number
    maxOutputTokens: number
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
    /**
     * if this model is compatible with OpenAI API provider
     * allow the site admin to set configuration params
     */
    openAICompatible?: OpenAICompatible
}

interface OpenAICompatible {
    // (optional) List of stop sequences to use for this model.
    stopSequences?: string[]

    // (optional) EndOfText identifier used by the model. e.g. "<|endoftext|>", "< EOT >"
    endOfText?: string

    // (optional) A hint the client should use when producing context to send to the LLM.
    // The maximum length of all context (prefix + suffix + snippets), in characters.
    contextSizeHintTotalCharacters?: number

    // (optional) A hint the client should use when producing context to send to the LLM.
    // The maximum length of the document prefix (text before the cursor) to include, in characters.
    contextSizeHintPrefixCharacters?: number

    // (optional) A hint the client should use when producing context to send to the LLM.
    // The maximum length of the document suffix (text after the cursor) to include, in characters.
    contextSizeHintSuffixCharacters?: number

    // (optional) Custom instruction to be included at the start of all chat messages
    // when using this model, e.g. "Answer all questions in Spanish."
    //
    // Note: similar to Cody client config option `cody.chat.preInstruction`; if user has
    // configured that it will be used instead of this.
    chatPreInstruction?: string

    // (optional) Custom instruction to be included at the end of all edit commands
    // when using this model, e.g. "Write all unit tests with Jest instead of detected framework."
    //
    // Note: similar to Cody client config option `cody.edit.preInstruction`; if user has
    // configured that it will be respected instead of this.
    editPostInstruction?: string

    // (optional) How long the client should wait for autocomplete results to come back (milliseconds),
    // before giving up and not displaying an autocomplete result at all.
    //
    // This applies on single-line completions, e.g. `var i = <completion>`
    //
    // Note: similar to hidden Cody client config option `cody.autocomplete.advanced.timeout.singleline`
    // If user has configured that, it will be respected instead of this.
    autocompleteSinglelineTimeout?: number

    // (optional) How long the client should wait for autocomplete results to come back (milliseconds),
    // before giving up and not displaying an autocomplete result at all.
    //
    // This applies on multi-line completions, which are based on intent-detection when e.g. a code block
    // is being completed, e.g. `func parseURL(url string) {<completion>`
    //
    // Note: similar to hidden Cody client config option `cody.autocomplete.advanced.timeout.multiline`
    // If user has configured that, it will be respected instead of this.
    autocompleteMultilineTimeout?: number

    // (optional) model parameters to use for the chat feature
    chatTopK?: number
    chatTopP?: number
    chatTemperature?: number
    chatMaxTokens?: number

    // (optional) model parameters to use for the autocomplete feature
    autoCompleteTopK?: number
    autoCompleteTopP?: number
    autoCompleteTemperature?: number
    autoCompleteSinglelineMaxTokens?: number
    autoCompleteMultilineMaxTokens?: number

    // (optional) model parameters to use for the edit feature
    editTopK?: number
    editTopP?: number
    editTemperature?: number
    editMaxTokens?: number
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

    clientSideConfig?: ClientSideConfig
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
    public readonly id: string
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
        id,
        modelRef,
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
        // Start by setting the model ref, by default using a new form but falling
        // back to using the old-style of parsing the modelId or using provided fields
        if (typeof modelRef === 'object') {
            this.modelRef = modelRef
        } else if (typeof modelRef === 'string') {
            this.modelRef = Model.parseModelRef(modelRef)
        } else {
            const info = getModelInfo(id)
            this.modelRef = {
                providerId: provider ?? info.provider,
                apiVersionId: 'unknown',
                modelId: title ?? info.title,
            }
        }
        this.id = id
        this.usage = usage
        this.contextWindow = contextWindow
        this.clientSideConfig = clientSideConfig
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
        contextWindow,
    }: ServerModel) {
        const ref = Model.parseModelRef(modelRef)
        return new Model({
            id: ref.modelId,
            modelRef: ref,
            usage: capabilities.flatMap(capabilityToUsage),
            contextWindow: {
                input: contextWindow.maxInputTokens,
                output: contextWindow.maxOutputTokens,
            },
            clientSideConfig: clientSideConfig,
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
    id: string
    modelRef?: ModelRefStr | ModelRef
    usage: ModelUsage[]
    contextWindow?: ModelContextWindow
    clientSideConfig?: ClientSideConfig
    tags?: ModelTag[]
    provider?: string
    title?: string
}

export interface PerSitePreferences {
    [endpoint: string]: SitePreferences
}

interface SitePreferences {
    defaults: {
        [usage in ModelUsage]?: string
    }
    selected: {
        [usage in ModelUsage]?: string
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
    /** Models available on the user's Sourcegraph instance. */
    private primaryModels: Model[] = []

    /** Models available from user's local instances, e.g. Ollama. */
    private localModels: Model[] = []

    /** persistent storage to save user preferences and server defaults */
    private storage: Storage | undefined

    /** current system auth status */
    private authStatus: AuthStatus | undefined

    /** Cache of users preferences and defaults across each endpoint they have used */
    private _preferences: PerSitePreferences | undefined

    private static STORAGE_KEY = 'model-preferences'

    // Get all the providers currently available to the user
    private get models(): Model[] {
        return this.primaryModels.concat(this.localModels)
    }

    // lazy loads the users preferences for the current endpoint into a local cache
    // or initializes a new cache if one doesn't exist
    private get preferences(): SitePreferences {
        const empty: SitePreferences = {
            defaults: {},
            selected: {},
        }
        const endpoint = this.authStatus?.endpoint
        if (!endpoint) {
            if (!process.env.VITEST) {
                logError('ModelsService::preferences', 'No auth status set')
            }
            return empty
        }
        // If global cache is missing, try loading from storage
        if (!this._preferences) {
            const serialized = this.storage?.get(ModelsService.STORAGE_KEY)
            this._preferences = (serialized ? JSON.parse(serialized) : {}) as PerSitePreferences
        }

        const current = this._preferences[endpoint]
        if (current) {
            // cache hit!
            return current
        }

        // Else the endpoint cache is missing, so initialize it
        this._preferences[endpoint] = empty
        return empty
    }

    public async onConfigChange(config: ClientConfiguration): Promise<void> {
        try {
            const isCodyWeb = config.agentIDE === CodyIDE.Web

            // Disable Ollama local models for cody web
            this.localModels = !isCodyWeb ? await fetchLocalOllamaModels() : []
        } catch {
            this.localModels = []
        }
    }

    public async setAuthStatus(authStatus: AuthStatus) {
        this.authStatus = authStatus
    }

    public setStorage(storage: Storage): void {
        this.storage = storage
    }

    /**
     * Sets the primary models available to the user.
     */
    public setModels(models: Model[]): void {
        logDebug('ModelsService', `Setting primary models: ${JSON.stringify(models.map(m => m.id))}`)
        this.primaryModels = models
    }

    /**
     * Sets the primary and default models from the server sent config
     */
    public async setServerSentModels(config: ServerModelConfiguration): Promise<void> {
        const models = config.models.map(Model.fromApi)
        this.setModels(models)
        await this.setServerDefaultModel(ModelUsage.Chat, config.defaultModels.chat)
        await this.setServerDefaultModel(ModelUsage.Edit, config.defaultModels.chat)
        await this.setServerDefaultModel(ModelUsage.Autocomplete, config.defaultModels.codeCompletion)
    }

    private async setServerDefaultModel(usage: ModelUsage, newDefaultModelRef: ModelRefStr) {
        const ref = Model.parseModelRef(newDefaultModelRef)
        const { preferences } = this

        // If our cached default model matches, nothing needed
        if (preferences.defaults[usage] === ref.modelId) {
            return
        }

        // Otherwise the model has updated so we should set it in the in-memory cache
        // as well as the on-disk cache if it exists, and drop any previously selected
        // models for this usage type
        preferences.defaults[usage] = ref.modelId
        delete preferences.selected[usage]
        await this.flush()
    }

    private async flush(): Promise<void> {
        await this.storage?.set(ModelsService.STORAGE_KEY, JSON.stringify(this._preferences))
    }

    /**
     * Add new models for use.
     */
    public addModels(models: Model[]): void {
        const set = new Set(this.primaryModels)
        for (const provider of models) {
            set.add(provider)
        }
        this.primaryModels = Array.from(set)
    }

    private getModelsByType(usage: ModelUsage): Model[] {
        return this.models.filter(model => model.usage.includes(usage))
    }

    /**
     * Gets the available models of the specified usage type, with the default model first.
     *
     * @param type - The usage type of the models to retrieve.
     * @param authStatus - The authentication status of the user.
     * @returns An array of models, with the default model first.
     */
    public getModels(type: ModelUsage): Model[] {
        const models = this.getModelsByType(type)
        const currentModel = this.getDefaultModel(type)
        if (!currentModel) {
            return models
        }
        return [currentModel].concat(models.filter(m => m.id !== currentModel.id))
    }

    public getDefaultModel(type: ModelUsage): Model | undefined {
        // Free users can only use the default free model, so we just find the first model they can use
        const models = this.getModelsByType(type)
        const firstModelUserCanUse = models.find(m => this.isModelAvailable(m))

        const { preferences } = this

        // Check to see if the user has a selected a default model for this
        // usage type and if not see if there is a server sent default type
        const selected = this.resolveModel(preferences.selected[type] ?? preferences.defaults[type])
        if (selected && this.isModelAvailable(selected)) {
            return selected
        }

        return firstModelUserCanUse
    }

    public getDefaultEditModel(): EditModel | undefined {
        return this.getDefaultModel(ModelUsage.Edit)?.id
    }

    public getDefaultChatModel(): ChatModel | undefined {
        return this.getDefaultModel(ModelUsage.Chat)?.id
    }

    public async setSelectedModel(type: ModelUsage, model: Model | string): Promise<void> {
        const resolved = this.resolveModel(model)
        if (!resolved) {
            return
        }
        if (!resolved.usage.includes(type)) {
            throw new Error(`Model "${resolved.id}" is not compatible with usage type "${type}".`)
        }
        logDebug('ModelsService', `Setting selected ${type} model to ${resolved.id}`)
        this.preferences.selected[type] = resolved.id
        await this.flush()
    }

    public isModelAvailable(model: string | Model): boolean {
        const status = this.authStatus
        if (!status) {
            return false
        }
        const resolved = this.resolveModel(model)
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
    private resolveModel(modelID: Model | string | undefined): Model | undefined {
        if (!modelID) {
            return undefined
        }
        if (typeof modelID !== 'string') {
            return modelID
        }

        return this.models.find(m => modelID.includes(m.id))
    }

    /**
     * Finds the model provider with the given model ID and returns its Context Window.
     */
    public getContextWindowByID(modelID: string): ModelContextWindow {
        const model = this.models.find(m => m.id === modelID)
        return model
            ? model.contextWindow
            : { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET }
    }

    public getModelByID(modelID: string): Model | undefined {
        return this.models.find(m => m.id === modelID)
    }

    public getModelByIDSubstringOrError(modelSubstring: string): Model {
        const models = this.models.filter(m => m.id.includes(modelSubstring))
        if (models.length === 1) {
            return models[0]
        }
        const errorMessage =
            models.length > 1
                ? `Multiple models found for substring ${modelSubstring}.`
                : `No models found for substring ${modelSubstring}.`
        const modelsList = this.models.map(m => m.id).join(', ')
        throw new Error(`${errorMessage} Available models: ${modelsList}`)
    }
}

export const modelsService = singletonNotYetSet<ModelsService>()
setSingleton(modelsService, new ModelsService())

interface Storage {
    get(key: string): string | null
    set(key: string, value: string): Promise<void>
    delete(key: string): Promise<void>
}

function capabilityToUsage(capability: ModelCapability): ModelUsage[] {
    switch (capability) {
        case 'autocomplete':
            return [ModelUsage.Autocomplete]
        case 'chat':
            return [ModelUsage.Chat, ModelUsage.Edit]
    }
}
