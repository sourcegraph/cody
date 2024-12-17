import { Observable, interval, map } from 'observable-fns'
import type { AuthStatus } from '../auth/types'
import { clientCapabilities } from '../configuration/clientCapabilities'
import { cenv } from '../configuration/environment'
import type { PickResolvedConfiguration } from '../configuration/resolver'
import { FeatureFlag, featureFlagProvider } from '../experimentation/FeatureFlagProvider'
import { fetchLocalOllamaModels } from '../llm-providers/ollama/utils'
import { logDebug } from '../logger'
import {
    combineLatest,
    distinctUntilChanged,
    shareReplay,
    startWith,
    take,
    tap,
} from '../misc/observable'
import { pendingOperation } from '../misc/observableOperation'
import { ANSWER_TOKENS } from '../prompt/constants'
import type { CodyClientConfig } from '../sourcegraph-api/clientConfig'
import { isDotCom } from '../sourcegraph-api/environments'
import type { CodyLLMSiteConfiguration } from '../sourcegraph-api/graphql/client'
import { RestClient } from '../sourcegraph-api/rest/client'
import type { UserProductSubscription } from '../sourcegraph-api/userProductSubscription'
import { CHAT_INPUT_TOKEN_BUDGET } from '../token/constants'
import { isError } from '../utils'
import { getExperimentalClientModelByFeatureFlag } from './client'
import { type Model, type ServerModel, createModel, createModelFromServerModel } from './model'
import {
    DefaultsAndUserPreferencesForEndpoint,
    ModelsData, modelsService,
    ServerModelConfiguration,
} from './modelsService'
import { ModelTag } from './tags'
import { ModelUsage } from './types'
import { getEnterpriseContextWindow } from './utils'

const EMPTY_PREFERENCES: DefaultsAndUserPreferencesForEndpoint = { defaults: {}, selected: {} }

type ResolvedConfig = PickResolvedConfiguration<{
    configuration: true
    auth: true
    clientState: 'modelPreferences' | 'waitlist_o1'
}>

type RemoteModelsData = Pick<ModelsData, 'primaryModels'> & {
    preferences: Pick<ModelsData['preferences'], 'defaults'> | null
}

function getLocalModels(): Promise<Model[]> {
    return clientCapabilities().isCodyWeb
        ? Promise.resolve([]) // disable Ollama local models for Cody Web
        : fetchLocalOllamaModels().catch(() => [])
}

function getUserModelPreferences(endpoint: string, config: ResolvedConfig) {
    const preferences = config.clientState.modelPreferences
    logDebug('ModelsService', 'User model preferences changed', JSON.stringify(preferences))
    // Deep clone so it's not readonly and we can mutate it, for convenience.
    const prevPreferences = preferences[endpoint]
    return deepClone(prevPreferences ?? EMPTY_PREFERENCES)
}

async function getRemoteModels(
    authStatus: AuthStatus,
    clientConfig: CodyClientConfig | undefined,
    config: ResolvedConfig,
    configOverwrites: CodyLLMSiteConfiguration | null,
    userProductSubscription: UserProductSubscription | null,
    hasEarlyAccess: boolean,
    hasDeepCodyFlag: boolean,
    defaultToHaiku: boolean,
    fetchServerSideModels_?: typeof fetchServerSideModels,
) {
    const isDotComUser = isDotCom(authStatus)
    const isCodyFreeUser =
        userProductSubscription == null || userProductSubscription.userCanUpgrade === true

    if (isDotComUser || clientConfig?.modelsAPIEnabled) {
        const serverModelsConfig = fetchServerSideModels_ ? await fetchServerSideModels_(config) : undefined
        const data: RemoteModelsData = {
            preferences: {defaults: {}},
            primaryModels: [],
        }

        if (serverModelsConfig) {
            logDebug('ModelsService', 'new models API enabled')

            // Remove deprecated models from the list, filter out waitlisted models for Enterprise.
            const filteredModels = serverModelsConfig?.models.filter(
                m =>
                    m.status !== 'deprecated' &&
                    (isDotComUser || m.status !== 'waitlist')
            )
            data.primaryModels.push(
                ...maybeAdjustContextWindows(filteredModels).map(
                    createModelFromServerModel
                )
            )
            data.preferences!.defaults =
                defaultModelPreferencesFromServerModelsConfig(
                    serverModelsConfig
                )
        }

        // NOTE: Calling `registerModelsFromVSCodeConfiguration()` doesn't
        // entirely make sense in a world where LLM models are managed
        // server-side. However, this is how Cody can be extended to use locally
        // running LLMs such as Ollama. (Though some more testing is needed.)
        // See:
        // https://sourcegraph.com/blog/local-code-completion-with-ollama-and-cody
        data.primaryModels.push(...getModelsFromVSCodeConfiguration(config))

        // For DotCom users with early access or on the waitlist, replace the waitlist tag with the appropriate tags.
        // TODO(sqs): remove waitlist from localStorage when user has access
        const isOnWaitlist = config.clientState.waitlist_o1
        if (isDotComUser && (hasEarlyAccess || isOnWaitlist)) {
            data.primaryModels = data.primaryModels.map(
                model => {
                    if (model.tags.includes(ModelTag.Waitlist)) {
                        const newTags = model.tags.filter(
                            tag => tag !== ModelTag.Waitlist
                        )
                        newTags.push(
                            hasEarlyAccess
                                ? ModelTag.EarlyAccess
                                : ModelTag.OnWaitlist
                        )
                        return {...model, tags: newTags}
                    }
                    return model
                }
            )
        }

        // Replace user's current sonnet model with deep-cody model.
        const sonnetModel = data.primaryModels.find(m =>
            m.id.includes('sonnet')
        )
        // DEEP CODY is enabled for all PLG users.
        // Enterprise users need to have the feature flag enabled.
        const isDeepCodyEnabled =
            (isDotComUser && !isCodyFreeUser) || hasDeepCodyFlag
        if (
            isDeepCodyEnabled &&
            sonnetModel &&
            // Ensure the deep-cody model is only added once.
            !data.primaryModels.some(m =>
                m.id.includes('deep-cody')
            )
        ) {
            const DEEPCODY_MODEL =
                getExperimentalClientModelByFeatureFlag(
                    FeatureFlag.DeepCody
                )!
            data.primaryModels.push(
                ...maybeAdjustContextWindows([
                    DEEPCODY_MODEL,
                ]).map(createModelFromServerModel)
            )
        }

        // set the default model to Haiku for free users
        if (isDotComUser && isCodyFreeUser && defaultToHaiku) {
            const haikuModel = data.primaryModels.find(m =>
                m.id.includes('claude-3-5-haiku')
            )
            if (haikuModel) {
                data.preferences!.defaults.chat = haikuModel.id
            }
        }

        return data
    }

    // In enterprise mode, we let the sg instance dictate the token limits and allow users
    // to overwrite it locally (for debugging purposes).
    //
    // This is similiar to the behavior we had before introducing the new chat and allows
    // BYOK customers to set a model of their choice without us having to map it to a known
    // model on the client.
    //
    // NOTE: If configOverwrites?.chatModel is empty, automatically fallback to use the
    // default model configured on the instance.

    if (configOverwrites?.chatModel) {
        return {
            preferences: null,
            primaryModels: [
                createModel({
                    id: configOverwrites.chatModel,
                    // TODO (umpox) Add configOverwrites.editModel for separate edit support
                    usage: [ModelUsage.Chat, ModelUsage.Edit],
                    contextWindow: getEnterpriseContextWindow(
                        configOverwrites?.chatModel,
                        configOverwrites,
                        config.configuration
                    ),
                    tags: [ModelTag.Enterprise],
                }),
            ],
        } satisfies RemoteModelsData
    }

    // If the enterprise instance didn't have any configuration data for Cody, clear the
    // models available in the modelsService. Otherwise there will be stale, defunct models
    // available.
    return {
        preferences: null,
        primaryModels: [],
    } satisfies RemoteModelsData
}

/**
 * Observe the list of all available models.
 */
export function syncModels({
    resolvedConfig,
    authStatus,
    configOverwrites,
    clientConfig,
    fetchServerSideModels_ = fetchServerSideModels,
    userProductSubscription = Observable.of(null),
}: {
    resolvedConfig: Observable<
        PickResolvedConfiguration<{
            configuration: true
            auth: true
            clientState: 'modelPreferences' | 'waitlist_o1'
        }>
    >
    authStatus: Observable<AuthStatus>
    configOverwrites: Observable<CodyLLMSiteConfiguration | null | typeof pendingOperation>
    clientConfig: Observable<CodyClientConfig | undefined | typeof pendingOperation>
    fetchServerSideModels_?: typeof fetchServerSideModels
    userProductSubscription: Observable<UserProductSubscription | null | typeof pendingOperation>
}): Observable<ModelsData | typeof pendingOperation> {
    return combineLatest(
        authStatus,
        clientConfig,
        resolvedConfig,
        configOverwrites,
        userProductSubscription,
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyEarlyAccess),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.DeepCody),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyChatDefaultToClaude35Haiku),
        interval(10 * 60 * 60 /* 10 minutes */).pipe(
            startWith(undefined),
            take(
                // Use only a limited number of timers when running in Vitest so that `vi.runAllTimersAsync()` doesn't get into an infinite loop.
                cenv.CODY_TESTING_LIMIT_MAX_TIMERS ? 10 : Number.MAX_SAFE_INTEGER
            )
        )
    ).pipe(
        map(async ([authStatus, clientConfig, resolvedConfig, configOverwrites, userProductSubscription, hasEarlyAccess, hasDeepCodyFlag, defaultToHaiku]): Promise<ModelsData | typeof pendingOperation> => {
            if (authStatus.pendingValidation || userProductSubscription === pendingOperation || clientConfig === pendingOperation || configOverwrites === pendingOperation) {
                return pendingOperation
            }

            const endpoint = authStatus.endpoint
            const localModels = await getLocalModels()
            const userModelPreferences = getUserModelPreferences(endpoint, resolvedConfig)
            const remoteModelsData = await getRemoteModels(authStatus,
                clientConfig,
                resolvedConfig,
                configOverwrites,
                userProductSubscription,
                hasEarlyAccess,
                hasDeepCodyFlag,
                defaultToHaiku,
                fetchServerSideModels_)

            return {
                    endpoint: endpoint,
                    localModels: localModels,
                    primaryModels: isError(remoteModelsData)
                        ? []
                        : normalizeModelList(remoteModelsData.primaryModels),
                    preferences: isError(remoteModelsData)
                        ? userModelPreferences
                        : resolveModelPreferences(
                            remoteModelsData.preferences,
                            userModelPreferences
                        ),
                }
            }
        ),
        // Keep the old results while we're fetching the new ones, to avoid UI jitter.
        distinctUntilChanged(),
        tap(async modelsData => {
            if (modelsData !== pendingOperation && modelsData.primaryModels.length > 0) {
                logDebug(
                    'ModelsService',
                    'ModelsData changed',
                    `${modelsData.primaryModels.length} primary models`
                )
                await modelsService.setModelPreferences(modelsData, false)
            }
        }),
        shareReplay()
    )
}

function resolveModelPreferences(
    remote: Pick<DefaultsAndUserPreferencesForEndpoint, 'defaults'> | null,
    user: DefaultsAndUserPreferencesForEndpoint
): DefaultsAndUserPreferencesForEndpoint {
    user = deepClone(user)

    function setDefaultModel(usage: ModelUsage, newDefaultModelId: string | undefined): void {
        // If our cached default model matches, nothing needed.
        if (user.defaults[usage] === newDefaultModelId) {
            return
        }

        // Otherwise, the model has updated so we should set it in the
        // in-memory cache as well as the on-disk cache if it exists, and
        // drop any previously selected models for this usage type.
        user.defaults[usage] = newDefaultModelId
        delete user.selected[usage]
    }
    if (remote?.defaults) {
        setDefaultModel(ModelUsage.Chat, remote.defaults.chat)
        setDefaultModel(ModelUsage.Edit, remote.defaults.edit || remote.defaults.chat)
        setDefaultModel(ModelUsage.Autocomplete, remote.defaults.autocomplete)
    }
    return user
}

/**
 * Don't allow a BYOK model to shadow a model from the server.
 */
function normalizeModelList(models: Model[]): Model[] {
    const modelsBYOK = models.filter(model => model.tags.includes(ModelTag.BYOK))
    const modelsNonBYOK = models.filter(model => !model.tags.includes(ModelTag.BYOK))

    const modelIDsNonBYOK = new Set(modelsNonBYOK.map(m => m.id))
    return [...modelsNonBYOK, ...modelsBYOK.filter(model => !modelIDsNonBYOK.has(model.id))]
}

export interface ChatModelProviderConfig {
    provider: string
    model: string
    inputTokens?: number
    outputTokens?: number
    apiKey?: string
    apiEndpoint?: string
    options?: Record<string, any>
}

/**
 * Adds any Models defined by the Visual Studio "cody.dev.models" configuration into the
 * modelsService. This provides a way to interact with models not hard-coded by default.
 *
 * NOTE: DotCom Connections only as model options are not available for Enterprise BUG: This does
 * NOT make any model changes based on the "cody.dev.useServerDefinedModels".
 *
 * @internal This accesses config outside of the {@link resolvedConfig} global observable, but it
 * takes a `config` parameter (that it doesn't actually use) to try to enforce that it is a functon
 * of the config.
 */
function getModelsFromVSCodeConfiguration({
    configuration: { devModels },
}: PickResolvedConfiguration<{ configuration: 'devModels' }>): Model[] {
    return (
        devModels?.map(m =>
            createModel({
                id: `${m.provider}/${m.model}`,
                usage: [ModelUsage.Chat, ModelUsage.Edit],
                contextWindow: {
                    input: m.inputTokens ?? CHAT_INPUT_TOKEN_BUDGET,
                    output: m.outputTokens ?? ANSWER_TOKENS,
                },
                clientSideConfig: {
                    apiKey: m.apiKey,
                    apiEndpoint: m.apiEndpoint,
                    options: m.options,
                },
                tags: [ModelTag.Local, ModelTag.BYOK, ModelTag.Experimental],
            })
        ) ?? []
    )
}

// fetchServerSideModels contacts the Sourcegraph endpoint, and fetches the LLM models it
// currently supports. Requires that the current user is authenticated, with their credentials
// stored.
//
// Throws an exception on any errors.
async function fetchServerSideModels(
    config: PickResolvedConfiguration<{ configuration: 'customHeaders'; auth: true }>,
    signal?: AbortSignal
): Promise<ServerModelConfiguration | undefined> {
    // Fetch the data via REST API.
    // NOTE: We may end up exposing this data via GraphQL, it's still TBD.
    const client = new RestClient(
        config.auth.serverEndpoint,
        config.auth.accessToken ?? undefined,
        config.configuration.customHeaders
    )
    return await client.getAvailableModels(signal)
}

/**
 * maybeAdjustContextWindows adjusts the context window input tokens for specific models to prevent
 * context window overflow caused by token count discrepancies.
 *
 * Currently, the OpenAI tokenizer is used by default for all models. However, it often
 * counts tokens incorrectly for non-OpenAI models (e.g., Mistral), leading to over-counting
 * and potentially causing completion requests to fail due to exceeding the context window.
 *
 * The proper fix would be to use model-specific tokenizers, but this would require significant
 * refactoring. As a temporary workaround, this function reduces the `maxInputTokens` for specific
 * models to mitigate the risk of context window overflow.
 *
 * @param {ServerModel[]} models - An array of models from the site config.
 * @returns {ServerModel[]} - The array of models with adjusted context windows where applicable.
 */
export const maybeAdjustContextWindows = (models: ServerModel[]): ServerModel[] =>
    models.map(model => {
        let maxInputTokens = model.contextWindow.maxInputTokens
        if (/^mi(x|s)tral/.test(model.modelName)) {
            // Adjust the context window size for Mistral models because the OpenAI tokenizer undercounts tokens in English
            // compared to the Mistral tokenizer. Based on our observations, the OpenAI tokenizer usually undercounts by about 13%.
            // We reduce the context window by 15% (0.85 multiplier) to provide a safety buffer and prevent potential overflow.
            // Note: In other languages, the OpenAI tokenizer might actually overcount tokens. As a result, we accept the risk
            // of using a slightly smaller context window than what's available for those languages.
            maxInputTokens = Math.round(model.contextWindow.maxInputTokens * 0.85)
        }
        return { ...model, contextWindow: { ...model.contextWindow, maxInputTokens } }
    })

function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

export function defaultModelPreferencesFromServerModelsConfig(
    config: ServerModelConfiguration
): DefaultsAndUserPreferencesForEndpoint['defaults'] {
    return {
        autocomplete: config.defaultModels.codeCompletion,
        chat: config.defaultModels.chat,
        edit: config.defaultModels.chat,
    }
}
