import {map, type Observable} from 'observable-fns'

import {authStatus} from '../auth/authStatus'
import {type PickResolvedConfiguration, resolvedConfig} from '../configuration/resolver'
import {FeatureFlag} from '../experimentation/FeatureFlagProvider'
import {logDebug} from '../logger'
import {
    combineLatest,
    distinctUntilChanged,
    shareReplay,
    type StoredLastValue,
    storeLastValue,
    type Unsubscribable,
} from '../misc/observable'
import {firstResultFromOperation, pendingOperation, skipPendingOperation} from '../misc/observableOperation'
import {ClientConfigSingleton} from '../sourcegraph-api/clientConfig'
import {userProductSubscription,} from '../sourcegraph-api/userProductSubscription'
import {CHAT_INPUT_TOKEN_BUDGET, CHAT_OUTPUT_TOKEN_BUDGET} from '../token/constants'
import {configOverwrites} from './configOverwrites'
import {type Model, type ServerModel} from './model'
import {syncModels} from './sync'
import {ModelTag} from './tags'
import {ChatModel, type ModelContextWindow, ModelUsage} from './types'

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
export type ModelCapability = 'chat' | 'autocomplete' | 'edit' | 'vision'

export interface ContextWindow {
    maxInputTokens: number
    maxOutputTokens: number
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
    selectedOrDefault: {
        [usage in ModelUsage]?: Model
    }
}

export interface ModelsData extends DefaultsAndUserPreferencesForEndpoint{
    endpoint: string,

    /** Models available on the endpoint (Sourcegraph instance). */
    primaryModels: Model[]

    /** Models available on the user's local device (e.g., on Ollama). */
    localModels: Model[]
}

export const EMPTY_MODELS_DATA: ModelsData = {
    endpoint: '',
    localModels: [],
    primaryModels: [],
    selectedOrDefault: {}
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

    public async setModelPreferences(modelsData: ModelsData, shouldEditDefaultToGpt4oMini: boolean): Promise<void> {
        // Ensures we only change user preferences once
        // when they join the A/B test.
        const isEnrolled = this.storage?.getEnrollmentHistory(
            FeatureFlag.CodyEditDefaultToGpt4oMini
        )

        // Ensures that we have the gpt-4o-mini model
        // we want to default to in this A/B test.
        const gpt4oMini = modelsData.primaryModels.find(
            model => model?.modelRef?.modelId === 'gpt-4o-mini'
        )

        const allSitePrefs = this.storage?.getModelPreferences()
        const currentAccountPrefs = { ...modelsData.selectedOrDefault }

        if (!isEnrolled && shouldEditDefaultToGpt4oMini && gpt4oMini) {
            // For users enrolled in the A/B test, we'll default
            // to the gpt-4-mini model when using the Edit command.
            // They still can switch back to other models if they want.
            currentAccountPrefs.edit = gpt4oMini
        }

        const updated: DefaultsAndUserPreferencesByEndpoint = {
            ...allSitePrefs,
            [modelsData.endpoint]: { selectedOrDefault: currentAccountPrefs },
        }

        await this.storage?.setModelPreferences(updated)
    }

    public setStorage(storage: LocalStorageForModelPreferences): void {
        this.storage = storage
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
                    clientState: 'modelPreferences' | 'waitlist_o1'
                }> => config
            ),
            distinctUntilChanged()
        ),
        authStatus,
        configOverwrites,
        clientConfig: ClientConfigSingleton.getInstance().changes,
        userProductSubscription,
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

    /**
     * Gets the available models of the specified usage type, with the default model first.
     *
     * @param type - The usage type of the models to retrieve.
     * @returns An Observable that emits an array of models, with the default model first.
     */
    public getModels(type: ModelUsage): Observable<Model[] | typeof pendingOperation> {
        return combineLatest(this.modelsChanges).pipe(
            map(([data]) => {
                if (data === pendingOperation) {
                    return pendingOperation
                }
                const models = data.primaryModels
                    .concat(data.localModels)
                    .filter(model => model.usage.includes(type))
                const currentModel = data.selectedOrDefault[type]
                if (!currentModel) {
                    return models
                }
                return [currentModel].concat(models.filter(m => m.id !== currentModel?.id))
            }),
            distinctUntilChanged(),
            shareReplay()
        )
    }

    public getDefaultModel(type: ModelUsage): Observable<Model | undefined | typeof pendingOperation> {
        return combineLatest(this.modelsChanges).pipe(
            map(([data]) => {
                if (data === pendingOperation) {
                    return pendingOperation
                }
                return data.selectedOrDefault[type]
            })
        )
    }

    public getDefaultChatModel(): Observable<ChatModel | undefined | typeof pendingOperation> {
        return this.getDefaultModel(ModelUsage.Chat).pipe(skipPendingOperation(), map(value => value?.id))
    }

    public getDefaultEditModel(): Observable<ChatModel | undefined | typeof pendingOperation> {
        return this.getDefaultModel(ModelUsage.Edit).pipe(skipPendingOperation(), map(value => value?.id))
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
        const serverEndpoint = (await firstResultFromOperation(authStatus)).endpoint
        const currentPrefs = deepClone(this.storage.getModelPreferences())
        if (!currentPrefs[serverEndpoint]) {
            currentPrefs[serverEndpoint] = modelsData
        }
        currentPrefs[serverEndpoint].selectedOrDefault[type] = resolved
        await this.storage.setModelPreferences(currentPrefs)
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

    public isStreamDisabled(modelID: string): boolean {
        // TODO(sqs)#observe: remove synchronous access here, return an Observable<boolean> instead
        const model = this.getModelByID(modelID)
        return model?.tags.includes(ModelTag.StreamDisabled) ?? false
    }
}

export const modelsService = new ModelsService()

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

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}
