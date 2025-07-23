import { type Observable, map } from 'observable-fns'

import { authStatus, currentAuthStatus } from '../auth/authStatus'
import { mockAuthStatus } from '../auth/authStatus'
import { type AuthStatus, isEnterpriseUser } from '../auth/types'
import { AUTH_STATUS_FIXTURE_AUTHED_DOTCOM } from '../auth/types'
import { type PickResolvedConfiguration, resolvedConfig } from '../configuration/resolver'
import { FeatureFlag, featureFlagProvider } from '../experimentation/FeatureFlagProvider'
import { logDebug } from '../logger'
import {
    type StoredLastValue,
    type Unsubscribable,
    combineLatest,
    distinctUntilChanged,
    shareReplay,
    storeLastValue,
    tap,
} from '../misc/observable'
import { firstResultFromOperation, pendingOperation } from '../misc/observableOperation'
import { ClientConfigSingleton } from '../sourcegraph-api/clientConfig'
import { CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET } from '../token/constants'
import { configOverwrites } from './configOverwrites'
import { type Model, type ServerModel, modelTier } from './model'
import { syncModels } from './sync'
import { ModelTag } from './tags'
import { type ChatModel, type EditModel, type ModelContextWindow, ModelUsage } from './types'

type ModelId = string
type ApiVersionId = string
type ProviderId = string

export type ModelRefStr = `${ProviderId}::${ApiVersionId}::${ModelId}`
export type LegacyModelRefStr = `${ProviderId}/${ModelId}`
export interface ModelRef {
    providerId: ProviderId
    apiVersionId: ApiVersionId
    modelId: ModelId
}

export type ModelCategory =
    | ModelTag.Power
    | ModelTag.Balanced
    | ModelTag.Speed
    | 'accuracy'
    | ModelTag.Other
export type ModelStatus =
    | ModelTag.Experimental
    | ModelTag.EarlyAccess
    | ModelTag.OnWaitlist
    | ModelTag.Waitlist
    | ModelTag.Internal
    | 'stable'
    | ModelTag.Deprecated
    | ModelTag.Internal
export type ModelTier = ModelTag.Free | ModelTag.Pro | ModelTag.Enterprise
/** Must match types on github.com/sourcegraph/sourcegraph/-/blob/internal/modelconfig/types/model.go */
export type ModelCapability = 'chat' | 'autocomplete' | 'edit' | 'vision' | 'reasoning' | 'tools'
/** Must match types on github.com/sourcegraph/sourcegraph/-/blob/internal/modelconfig/types/model.go */
export type ModelConfigAllTiers = {
    [key in ModelTier]: ModelConfigByTier
}

/** Matching github.com/sourcegraph/sourcegraph/-/blob/internal/modelconfig/types/model.go */
export interface ModelConfigByTier {
    contextWindow: ContextWindow
}

/** Matching github.com/sourcegraph/sourcegraph/-/blob/internal/modelconfig/types/model.go */
export interface ContextWindow {
    maxInputTokens: number
    maxOutputTokens: number
    // maxUserInputTokens is the maximum number of tokens user puts into the chat message.
    // It is part of the input context window (maxInputTokens)
    maxUserInputTokens?: number
}

export interface ClientSideConfig {
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
    /**
     * The additional setting options for the model.
     * E.g. "temperature": 0.5, "max_tokens": 100, "stream": false
     */
    options?: Record<string, any>
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

interface Provider {
    id: string
    displayName: string
}

interface DefaultModels {
    chat: ModelRefStr
    fastChat: ModelRefStr
    codeCompletion: ModelRefStr
    unlimitedChat: ModelRefStr
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

export interface DefaultsAndUserPreferencesByEndpoint {
    [endpoint: string]: DefaultsAndUserPreferencesForEndpoint
}

/**
 * The endpoint defaults and user preferences for a single endpoint.
 */
export interface DefaultsAndUserPreferencesForEndpoint {
    /**
     * The server's default models for each usage.
     */
    defaults: {
        [usage in ModelUsage]?: string
    }

    /**
     * The user's selected models for each usage, which take precedence over the defaults.
     */
    selected: {
        [usage in ModelUsage]?: string
    }
}

export interface ModelsData {
    /** Models available on the endpoint (Sourcegraph instance). */
    primaryModels: Model[]

    /** Models available on the user's local device (e.g., on Ollama). */
    localModels: Model[]

    /** Preferences for the current endpoint. */
    preferences: DefaultsAndUserPreferencesForEndpoint

    /** Rate limit status. */
    isRateLimited?: boolean
}

const EMPTY_MODELS_DATA: ModelsData = {
    localModels: [],
    preferences: { defaults: {}, selected: {} },
    primaryModels: [],
}

export interface LocalStorageForModelPreferences {
    getEnrollmentHistory(featureName: string): boolean
    getModelPreferences(): DefaultsAndUserPreferencesByEndpoint
    setModelPreferences(preferences: DefaultsAndUserPreferencesByEndpoint): Promise<void>
}

export interface ModelAvailabilityStatus {
    model: Model
    isModelAvailable: boolean
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
    private storage: LocalStorageForModelPreferences | undefined

    private storedValue: StoredLastValue<ModelsData>
    private syncPreferencesSubscription?: Unsubscribable

    constructor(testing__mockModelsChanges?: ModelsService['modelsChanges']) {
        if (testing__mockModelsChanges) {
            this.modelsChanges = testing__mockModelsChanges
        }
        this.storedValue = storeLastValue(
            this.modelsChanges.pipe(map(data => (data === pendingOperation ? EMPTY_MODELS_DATA : data)))
        )
    }

    public setStorage(storage: LocalStorageForModelPreferences): void {
        this.storage = storage

        this.syncPreferencesSubscription = combineLatest(
            this.modelsChanges,
            featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyEditDefaultToGpt4oMini),
            featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyDeepSeekChat)
        )
            .pipe(
                tap(([data, shouldEditDefaultToGpt4oMini, shouldChatDefaultToDeepSeek]) => {
                    if (data === pendingOperation) {
                        return
                    }

                    // Ensures we only change user preferences once
                    // when they join the A/B test.
                    const isEnrolled = this.storage?.getEnrollmentHistory(
                        FeatureFlag.CodyEditDefaultToGpt4oMini
                    )

                    // Check if this user has already been enrolled in the deepseek chat feature flag experiment.
                    // We only want to change their default model ONCE when they first join the A/B test.
                    // This ensures that:
                    // 1. New users in the test group get deepseek as their default model
                    // 2. If they later explicitly choose a different model (e.g., sonnet), we respect that choice
                    // 3. Their chosen preference persists across sessions and new chats
                    // 4. We don't override their preference every time they load the app
                    const isEnrolledDeepSeekChat = this.storage?.getEnrollmentHistory(
                        FeatureFlag.CodyDeepSeekChat
                    )

                    // Ensures that we have the gpt-4o-mini model
                    // we want to default to in this A/B test.
                    const gpt4oMini = data.primaryModels.find(
                        model => model?.modelRef?.modelId === 'gpt-4o-mini'
                    )

                    // Ensures that we have the deepseek model
                    // we want to default to in this A/B test
                    // The model is defined at https://sourcegraph.sourcegraph.com/github.com/sourcegraph/sourcegraph/-/blob/cmd/cody-gateway-config/dotcom_models.go?L323
                    const deepseekModel = data.primaryModels.find(
                        model => model?.id === 'fireworks::v1::deepseek-v3'
                    )

                    const allSitePrefs = this.storage?.getModelPreferences()
                    const currentAccountPrefs = { ...data.preferences }

                    if (!isEnrolled && shouldEditDefaultToGpt4oMini && gpt4oMini) {
                        // For users enrolled in the A/B test, we'll default
                        // to the gpt-4-mini model when using the Edit command.
                        // They still can switch back to other models if they want.
                        currentAccountPrefs.selected.edit = gpt4oMini.id
                    }

                    if (!isEnrolledDeepSeekChat && shouldChatDefaultToDeepSeek && deepseekModel) {
                        // For users enrolled in the A/B test, we'll default
                        // to the deepseek model when using the Chat command.
                        // They still can switch back to other models if they want.
                        currentAccountPrefs.selected.chat = deepseekModel.id
                    }

                    const updated: DefaultsAndUserPreferencesByEndpoint = {
                        ...allSitePrefs,
                        [currentAuthStatus().endpoint]: currentAccountPrefs,
                    }
                    this.storage?.setModelPreferences(updated)
                })
            )
            .subscribe({})
    }

    public dispose(): void {
        this.storedValue.subscription.unsubscribe()
        this.syncPreferencesSubscription?.unsubscribe()
    }

    /**
     * An observable that emits all available models upon subscription and whenever there are
     * changes.
     */
    public modelsChanges: Observable<ModelsData | typeof pendingOperation> = syncModels({
        resolvedConfig: resolvedConfig.pipe(
            map(
                (
                    config
                ): PickResolvedConfiguration<{
                    configuration: true
                    auth: true
                    clientState: 'modelPreferences'
                }> => config
            ),
            distinctUntilChanged()
        ),
        authStatus,
        configOverwrites,
        clientConfig: ClientConfigSingleton.getInstance().changes,
    })

    /**
     * The list of models.
     *
     * @internal `public` for testing only.
     */
    public get models(): Model[] {
        const data = this.storedValue.value.last
        return data ? data.primaryModels.concat(data.localModels) : []
    }

    private getModelsByType(usage: ModelUsage): Observable<Model[] | typeof pendingOperation> {
        return this.modelsChanges.pipe(
            map(models => {
                return models === pendingOperation
                    ? pendingOperation
                    : [...models.primaryModels, ...models.localModels].filter(model =>
                          model.usage.includes(usage)
                      )
            }),
            distinctUntilChanged()
        )
    }

    /**
     * Gets the available models of the specified usage type, with the default model first.
     *
     * @param type - The usage type of the models to retrieve.
     * @returns An Observable that emits an array of models, with the default model first.
     */
    public getModels(type: ModelUsage): Observable<Model[] | typeof pendingOperation> {
        return combineLatest(this.modelsChanges, this.getDefaultModel(type)).pipe(
            map(([data, currentModel]) => {
                if (data === pendingOperation || currentModel === pendingOperation) {
                    return pendingOperation
                }
                const models = data.primaryModels
                    .concat(data.localModels)
                    .filter(model => model.usage.includes(type))
                if (!currentModel) {
                    return models
                }
                return [currentModel].concat(models.filter(m => m.id !== currentModel.id))
            }),
            distinctUntilChanged(),
            shareReplay()
        )
    }

    public async getModelsAvailabilityStatus(type: ModelUsage): Promise<ModelAvailabilityStatus[]> {
        const models = await firstResultFromOperation(modelsService.getModels(type))
        return Promise.all(
            models.map(async model => {
                const isModelAvailable = await firstResultFromOperation(this.isModelAvailable(model))
                return { model, isModelAvailable }
            })
        )
    }

    public getDefaultModel(type: ModelUsage): Observable<Model | undefined | typeof pendingOperation> {
        return combineLatest(this.getModelsByType(type), this.modelsChanges, authStatus).pipe(
            map(([models, modelsData, authStatus]) => {
                if (models === pendingOperation || modelsData === pendingOperation) {
                    return pendingOperation
                }

                // Remove deprecated models from the list
                models = models.filter(model => !model.tags.includes(ModelTag.Deprecated))

                // Find the first model the user can use that isn't a reasoning model
                const firstModelUserCanUse = models.find(
                    m =>
                        this._isModelAvailable(modelsData, authStatus, m) === true &&
                        !m.tags.includes(ModelTag.Reasoning)
                )

                if (modelsData.preferences) {
                    // Check to see if the user has a selected a default model for this
                    // usage type and if not see if there is a server sent default type
                    const selected = this.resolveModel(
                        modelsData,
                        modelsData.preferences.selected[type] ?? modelsData.preferences.defaults[type]
                    )
                    if (
                        selected &&
                        // Don't set default model for ModelUsage.Edit if the model has certain tags
                        !(
                            type === ModelUsage.Edit &&
                            (selected.tags.includes(ModelTag.Reasoning) ||
                                selected.tags.includes(ModelTag.Deprecated))
                        ) &&
                        this._isModelAvailable(modelsData, authStatus, selected) === true
                    ) {
                        return selected
                    }
                }
                return firstModelUserCanUse
            }),
            distinctUntilChanged(),
            shareReplay()
        )
    }

    /**
     * Gets the default edit model, which is determined by first checking the default edit model,
     * and if that is not available, falling back to the default chat model.
     */
    public getDefaultEditModel(): Observable<EditModel | undefined | typeof pendingOperation> {
        return combineLatest(
            this.getDefaultModel(ModelUsage.Edit),
            this.getDefaultModel(ModelUsage.Chat)
        ).pipe(
            map(([editModel, chatModel]) => {
                if (editModel === pendingOperation || chatModel === pendingOperation) {
                    return pendingOperation
                }

                // Filter out reasoning models
                if (editModel && !editModel.tags.includes(ModelTag.Reasoning)) {
                    return editModel?.id
                }

                // If edit model is not available or is a reasoning model, check chat model
                if (chatModel && !chatModel.tags.includes(ModelTag.Reasoning)) {
                    return chatModel?.id
                }

                return undefined
            })
        )
    }
    public getDefaultChatModel(): Observable<ChatModel | undefined | typeof pendingOperation> {
        return this.getDefaultModel(ModelUsage.Chat).pipe(
            map(model => (model === pendingOperation ? pendingOperation : model?.id))
        )
    }

    public async setSelectedModel(type: ModelUsage, model: Model | string): Promise<void> {
        const modelsData = await firstResultFromOperation(this.modelsChanges)
        const resolved = this.resolveModel(modelsData, model)
        if (!resolved) {
            throw new Error(`Model not found: ${typeof model === 'string' ? model : model.id}`)
        }
        if (!resolved.usage.includes(type)) {
            throw new Error(`Model "${resolved.id}" is not compatible with usage type "${type}".`)
        }
        logDebug('ModelsService', `Setting selected ${type} model to ${resolved.id}`)
        if (!this.storage) {
            throw new Error('ModelsService.storage is not set')
        }
        const serverEndpoint = currentAuthStatus().endpoint
        const currentPrefs = deepClone(this.storage.getModelPreferences())
        if (!currentPrefs[serverEndpoint]) {
            currentPrefs[serverEndpoint] = modelsData.preferences
        }
        currentPrefs[serverEndpoint].selected[type] = resolved.id
        await this.storage.setModelPreferences(currentPrefs)
    }

    public isModelAvailable(model: string | Model): Observable<boolean | typeof pendingOperation> {
        return combineLatest(authStatus, this.modelsChanges).pipe(
            map(([authStatus, modelsData]) =>
                modelsData === pendingOperation
                    ? pendingOperation
                    : this._isModelAvailable(modelsData, authStatus, model)
            ),
            distinctUntilChanged()
        )
    }

    private _isModelAvailable(
        modelsData: ModelsData,
        authStatus: AuthStatus,
        model: string | Model
    ): boolean {
        const resolved = this.resolveModel(modelsData, model)
        if (!resolved) {
            return false
        }
        const tier = modelTier(resolved)
        // Cody Enterprise users are able to use any models that the backend says is supported.
        if (isEnterpriseUser(authStatus)) {
            return true
        }

        return tier === 'free'
    }

    // does an approximate match on the model id, seeing if there are any models in the
    // cache that are contained within the given model id. This allows passing a qualified,
    // unqualified or ModelRefStr in as the model id will be a substring
    private resolveModel(
        modelsData: ModelsData,
        modelID: Model | string | undefined
    ): Model | undefined {
        if (!modelID) {
            return undefined
        }
        if (typeof modelID !== 'string') {
            return modelID
        }

        const models = modelsData.primaryModels.concat(modelsData.localModels)
        return models.find(m => modelID.endsWith(m.id)) ?? models.find(m => modelID.includes(m.id))
    }

    /**
     * Finds the model provider with the given model ID and returns its Context Window.
     */
    public getContextWindowByID(modelID: string, models = this.models): ModelContextWindow {
        // TODO(sqs)#observe: remove synchronous access here, return an Observable<ModelContextWindow> instead
        const model = models.find(m => m.id === modelID)
        return model
            ? model.contextWindow
            : { input: CHAT_INPUT_TOKEN_BUDGET, output: CHAT_OUTPUT_TOKEN_BUDGET }
    }

    public observeContextWindowByID(
        modelID: string
    ): Observable<ModelContextWindow | typeof pendingOperation> {
        return this.modelsChanges.pipe(
            map(data =>
                data === pendingOperation
                    ? pendingOperation
                    : this.getContextWindowByID(modelID, data.primaryModels.concat(data.localModels))
            )
        )
    }

    public getModelByID(modelID: string): Model | undefined {
        // TODO(sqs)#observe: remove synchronous access here, return an Observable<Model|undefined> instead
        return this.models.find(m => m.id === modelID)
    }

    public getAllModelsWithSubstring(modelSubstring: string): Model[] {
        // TODO(sqs)#observe: remove synchronous access here, return an Observable<Model|undefined> instead
        return this.models.filter(m => m.id.includes(modelSubstring))
    }

    public getModelByIDSubstringOrError(modelSubstring: string): Model {
        // TODO(sqs)#observe: remove synchronous access here, return an Observable<Model|Error> instead
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

    public getModelsByTag(tag: ModelTag): Model[] {
        return this.models.filter(m => m.tags.includes(tag))
    }

    public isStreamDisabled(modelID: string): boolean {
        // TODO(sqs)#observe: remove synchronous access here, return an Observable<boolean> instead
        const model = this.getModelByID(modelID)
        return model?.tags.includes(ModelTag.StreamDisabled) ?? false
    }
}

export const modelsService = new ModelsService()

interface MockModelsServiceResult {
    storage: TestLocalStorageForModelPreferences
    modelsService: ModelsService
}

export class TestLocalStorageForModelPreferences implements LocalStorageForModelPreferences {
    private isEnrolled = false
    constructor(public data: DefaultsAndUserPreferencesByEndpoint | null = null) {}

    getModelPreferences(): DefaultsAndUserPreferencesByEndpoint {
        return this.data || {}
    }

    async setModelPreferences(preferences: DefaultsAndUserPreferencesByEndpoint): Promise<void> {
        this.data = preferences
    }

    getEnrollmentHistory(_featureName: string): boolean {
        if (!this.isEnrolled) {
            this.isEnrolled = true
            return false
        }
        return true
    }
}

export function mockModelsService({
    storage = new TestLocalStorageForModelPreferences(),
    modelsService = new ModelsService(),
    authStatus = AUTH_STATUS_FIXTURE_AUTHED_DOTCOM,
}: {
    authStatus?: AuthStatus
    modelsService?: ModelsService
    storage?: TestLocalStorageForModelPreferences
}): MockModelsServiceResult {
    modelsService.setStorage(storage)
    mockAuthStatus(authStatus)
    return { storage, modelsService }
}

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}
