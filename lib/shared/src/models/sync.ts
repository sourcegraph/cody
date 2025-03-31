import { Observable, interval, map } from 'observable-fns'
import { currentAuthStatusOrNotReadyYet, mockAuthStatus } from '../auth/authStatus'
import { type AuthStatus, isCodyProUser } from '../auth/types'
import type { ClientConfiguration } from '../configuration'
import { clientCapabilities } from '../configuration/clientCapabilities'
import { cenv } from '../configuration/environment'
import type { PickResolvedConfiguration } from '../configuration/resolver'
import { FeatureFlag, featureFlagProvider } from '../experimentation/FeatureFlagProvider'
import { fetchLocalOllamaModels } from '../llm-providers/ollama/utils'
import { logDebug } from '../logger'
import {
    combineLatest,
    distinctUntilChanged,
    promiseFactoryToObservable,
    shareReplay,
    startWith,
    switchMap,
    take,
    tap,
} from '../misc/observable'
import { pendingOperation, switchMapReplayOperation } from '../misc/observableOperation'
import { ANSWER_TOKENS } from '../prompt/constants'
import type { CodyClientConfig } from '../sourcegraph-api/clientConfig'
import { isDotCom } from '../sourcegraph-api/environments'
import type { RateLimitError } from '../sourcegraph-api/errors'
import type { CodyLLMSiteConfiguration } from '../sourcegraph-api/graphql/client'
import { RestClient } from '../sourcegraph-api/rest/client'
import type { UserProductSubscription } from '../sourcegraph-api/userProductSubscription'
import { telemetryRecorder } from '../telemetry-v2/singleton'
import { CHAT_INPUT_TOKEN_BUDGET } from '../token/constants'
import { isError } from '../utils'
import { DEEP_CODY_MODEL, TOOL_CODY_MODEL } from './client'
import { type Model, type ServerModel, createModel, createModelFromServerModel } from './model'
import type {
    DefaultsAndUserPreferencesForEndpoint,
    ModelsData,
    ServerModelConfiguration,
} from './modelsService'
import { ModelTag } from './tags'
import { ModelUsage } from './types'
import { getEnterpriseContextWindow } from './utils'

const EMPTY_PREFERENCES: DefaultsAndUserPreferencesForEndpoint = { defaults: {}, selected: {} }
export const INPUT_TOKEN_FLAG_OFF: number = 45_000
const TOKEN_LIMITS = {
    MISTRAL_ADJUSTMENT_FACTOR: 0.85,
    ORIGINAL_ALL: {
        MAX_INPUT_TOKENS: 45_000,
        MAX_OUTPUT_TOKENS: 4_000,
    },
    PRO: {
        STANDARD_OUTPUT: 6_000,
        REASONING_OUTPUT: 16_000,
        MAX_INPUT_TOKENS: 175_000,
    },
}
let CHAT_MODEL_BEFORE_RATE_LIMIT = ''

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
            clientState: 'modelPreferences'
        }>
    >
    authStatus: Observable<AuthStatus>
    configOverwrites: Observable<CodyLLMSiteConfiguration | null | typeof pendingOperation>
    clientConfig: Observable<CodyClientConfig | undefined | typeof pendingOperation>
    fetchServerSideModels_?: typeof fetchServerSideModels
    userProductSubscription: Observable<UserProductSubscription | null | typeof pendingOperation>
}): Observable<ModelsData | typeof pendingOperation> {
    // Refresh Ollama models when Ollama-related config changes and periodically.
    const localModels = combineLatest(
        resolvedConfig.pipe(
            map(
                config =>
                    ({
                        autocompleteExperimentalOllamaOptions:
                            config.configuration.autocompleteExperimentalOllamaOptions,
                    }) satisfies Pick<ClientConfiguration, 'autocompleteExperimentalOllamaOptions'>
            ),
            distinctUntilChanged()
        ),
        interval(10 * 60 * 60 /* 10 minutes */).pipe(
            startWith(undefined),
            take(
                // Use only a limited number of timers when running in Vitest so that `vi.runAllTimersAsync()` doesn't get into an infinite loop.
                cenv.CODY_TESTING_LIMIT_MAX_TIMERS ? 10 : Number.MAX_SAFE_INTEGER
            )
        )
    ).pipe(
        switchMap(() =>
            clientCapabilities().isCodyWeb
                ? Observable.of([]) // disable Ollama local models for Cody Web
                : promiseFactoryToObservable(signal => fetchLocalOllamaModels().catch(() => []))
        ),
        // Keep the old localModels results while we're fetching the new ones, to avoid UI jitter.
        shareReplay()
    )

    const relevantConfig = resolvedConfig.pipe(
        map(
            config =>
                ({
                    configuration: {
                        customHeaders: config.configuration.customHeaders,
                        providerLimitPrompt: config.configuration.providerLimitPrompt,
                        devModels: config.configuration.devModels,
                    },
                    auth: config.auth,
                }) satisfies PickResolvedConfiguration<{
                    configuration: 'providerLimitPrompt' | 'customHeaders' | 'devModels'
                    auth: true
                }>
        ),
        distinctUntilChanged()
    )

    const userModelPreferences: Observable<DefaultsAndUserPreferencesForEndpoint> = resolvedConfig.pipe(
        map(config => {
            // Deep clone so it's not readonly and we can mutate it, for convenience.
            const prevPreferences = config.clientState.modelPreferences[config.auth.serverEndpoint]
            return deepClone(prevPreferences ?? EMPTY_PREFERENCES)
        }),
        distinctUntilChanged(),
        tap(preferences => {
            logDebug('ModelsService', 'User model preferences changed', JSON.stringify(preferences))
        }),
        shareReplay()
    )

    type RemoteModelsData = Pick<ModelsData, 'primaryModels'> & {
        preferences: Pick<ModelsData['preferences'], 'defaults'> | null
    }
    const remoteModelsData: Observable<RemoteModelsData | Error | typeof pendingOperation> =
        combineLatest(relevantConfig, authStatus, userProductSubscription).pipe(
            switchMapReplayOperation(([config, authStatus, userProductSubscription]) => {
                if (
                    authStatus.endpoint !== config.auth.serverEndpoint ||
                    authStatus.pendingValidation ||
                    userProductSubscription === pendingOperation
                ) {
                    return Observable.of(pendingOperation)
                }

                if (!authStatus.authenticated) {
                    return Observable.of<RemoteModelsData>({ primaryModels: [], preferences: null })
                }

                const isDotComUser = isDotCom(authStatus)
                const isCodyFreeUser =
                    userProductSubscription == null || userProductSubscription.userCanUpgrade === true

                const serverModelsConfig: Observable<
                    RemoteModelsData | Error | typeof pendingOperation
                > = clientConfig.pipe(
                    switchMapReplayOperation(maybeServerSideClientConfig => {
                        // NOTE: isDotComUser to enable server-side models for DotCom users,
                        // as the modelsAPIEnabled is default to return false on DotCom to avoid older clients
                        // that also share the same check from breaking.
                        if (isDotComUser || maybeServerSideClientConfig?.modelsAPIEnabled) {
                            logDebug('ModelsService', 'new models API enabled')
                            return promiseFactoryToObservable(signal =>
                                fetchServerSideModels_(config, signal)
                            ).pipe(
                                switchMap(serverModelsConfig => {
                                    const data: RemoteModelsData = {
                                        preferences: { defaults: {} },
                                        primaryModels: [],
                                    }

                                    // For DotCom users with early access or on the waitlist, replace the waitlist tag with the appropriate tags.
                                    const enableToolCody: Observable<boolean> = resolvedConfig.pipe(
                                        map(c => !!c.configuration.experimentalMinionAnthropicKey),
                                        distinctUntilChanged()
                                    )
                                    return combineLatest(
                                        featureFlagProvider.evaluateFeatureFlag(
                                            FeatureFlag.CodyEarlyAccess
                                        ),
                                        featureFlagProvider.evaluateFeatureFlag(FeatureFlag.DeepCody),
                                        featureFlagProvider.evaluateFeatureFlag(
                                            FeatureFlag.CodyChatDefaultToClaude35Haiku
                                        ),
                                        enableToolCody,
                                        featureFlagProvider.evaluateFeatureFlag(
                                            FeatureFlag.LongContextWindow
                                        )
                                    ).pipe(
                                        switchMap(
                                            ([
                                                hasEarlyAccess,
                                                hasAgenticChatFlag,
                                                defaultToHaiku,
                                                isToolCodyEnabled,
                                                longContextWindowFlag,
                                            ]) => {
                                                if (serverModelsConfig) {
                                                    // Remove deprecated models from the list, filter out waitlisted models for Enterprise.
                                                    const filteredModels =
                                                        serverModelsConfig?.models.filter(
                                                            m =>
                                                                m.status !== 'deprecated' &&
                                                                (isDotComUser || m.status !== 'waitlist')
                                                        )
                                                    data.primaryModels.push(
                                                        ...maybeAdjustContextWindows(filteredModels, {
                                                            tier: isDotComUser
                                                                ? isCodyProUser(
                                                                      authStatus,
                                                                      userProductSubscription
                                                                  )
                                                                    ? 'pro'
                                                                    : 'free'
                                                                : 'enterprise',
                                                            longContextWindowFlagEnabled:
                                                                longContextWindowFlag,
                                                        }).map(createModelFromServerModel)
                                                    )
                                                    if (data.preferences?.defaults) {
                                                        data.preferences.defaults =
                                                            defaultModelPreferencesFromServerModelsConfig(
                                                                serverModelsConfig
                                                            )
                                                    }
                                                }

                                                // NOTE: Calling `registerModelsFromVSCodeConfiguration()` doesn't
                                                // entirely make sense in a world where LLM models are managed
                                                // server-side. However, this is how Cody can be extended to use locally
                                                // running LLMs such as Ollama. (Though some more testing is needed.)
                                                // See:
                                                // https://sourcegraph.com/blog/local-code-completion-with-ollama-and-cody
                                                data.primaryModels.push(
                                                    ...getModelsFromVSCodeConfiguration(config)
                                                )

                                                // TODO(sqs): remove waitlist from localStorage when user has access
                                                if (isDotComUser && hasEarlyAccess) {
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
                                                                return { ...model, tags: newTags }
                                                            }
                                                            return model
                                                        }
                                                    )
                                                }

                                                // Enterprise instances with early access flag enabled
                                                const isVisionSupported = !isDotComUser && hasEarlyAccess
                                                data.primaryModels = data.primaryModels.map(m => ({
                                                    ...m,
                                                    // Gateway doesn't suppoort vision models for Google yet
                                                    tags:
                                                        isVisionSupported && m.provider !== 'google'
                                                            ? m.tags
                                                            : m.tags.filter(t => t !== ModelTag.Vision),
                                                }))

                                                const clientModels = []

                                                // Handle agentic chat features
                                                const isAgenticChatEnabled =
                                                    hasAgenticChatFlag ||
                                                    (isDotComUser && !isCodyFreeUser)
                                                // Handle agentic chat features
                                                const haikuModel = data.primaryModels.find(m =>
                                                    m.id.includes('5-haiku')
                                                )
                                                const sonnetModel = data.primaryModels.find(m =>
                                                    m.id.includes('5-sonnet')
                                                )
                                                const hasDeepCody = data.primaryModels.some(m =>
                                                    m.id.includes('deep-cody')
                                                )
                                                if (
                                                    !hasDeepCody &&
                                                    isAgenticChatEnabled &&
                                                    sonnetModel &&
                                                    haikuModel
                                                ) {
                                                    // Add Deep Cody
                                                    clientModels.push(DEEP_CODY_MODEL)
                                                    // Add Tool Cody
                                                    if (isToolCodyEnabled) {
                                                        clientModels.push(TOOL_CODY_MODEL)
                                                    }
                                                }

                                                // Add the client models to the list of models.
                                                data.primaryModels.push(
                                                    ...maybeAdjustContextWindows(clientModels, {
                                                        tier: isDotComUser
                                                            ? isCodyProUser(
                                                                  authStatus,
                                                                  userProductSubscription
                                                              )
                                                                ? 'pro'
                                                                : 'free'
                                                            : 'enterprise',
                                                        longContextWindowFlagEnabled:
                                                            longContextWindowFlag,
                                                    }).map(createModelFromServerModel)
                                                )

                                                // Set the default model to Haiku for free users.
                                                if (
                                                    isDotComUser &&
                                                    isCodyFreeUser &&
                                                    defaultToHaiku &&
                                                    haikuModel
                                                ) {
                                                    data.preferences!.defaults.chat = haikuModel.id
                                                }
                                                // disable the model (so that we can display that in the UI)
                                                console.log(
                                                    '[julia] check authStatus in sync.ts',
                                                    authStatus.rateLimited
                                                )
                                                if (authStatus.rateLimited) {
                                                    if (
                                                        authStatus.rateLimited[
                                                            'chat messages and commands'
                                                        ] === true
                                                    ) {
                                                        // Disable all models except for fast models
                                                        data.primaryModels = data.primaryModels.map(
                                                            model => {
                                                                // Disabled all models expect for fast models
                                                                if (
                                                                    !model.tags.includes(ModelTag.Speed)
                                                                ) {
                                                                    return { ...model, disabled: true }
                                                                }
                                                                return model
                                                            }
                                                        )
                                                        console.log('[julia] disabled models in sync.ts')

                                                        // Find the Gemini Flash model
                                                        const geminiFlashModel = data.primaryModels.find(
                                                            model =>
                                                                model.id ===
                                                                'google::v1::gemini-2.0-flash'
                                                        )

                                                        // Set Gemini Flash as the selected model for chat and edit
                                                        if (geminiFlashModel && data.preferences) {
                                                            CHAT_MODEL_BEFORE_RATE_LIMIT =
                                                                data.preferences.defaults.chat || ''
                                                            // Create a full preferences object with both defaults and selected
                                                            data.preferences.defaults.chat =
                                                                geminiFlashModel.id
                                                            telemetryRecorder.recordEvent(
                                                                'cody.rateLimit',
                                                                'hit',
                                                                {
                                                                    privateMetadata: {
                                                                        feature: 'chat',
                                                                        rateLimitedModel:
                                                                            geminiFlashModel.id,
                                                                    },
                                                                }
                                                            )
                                                            console.log(
                                                                '[julia] set model to gemini flash in sync.ts'
                                                            )
                                                        }
                                                    } else {
                                                        // Re-enable all models except for fast models
                                                        data.primaryModels = data.primaryModels.map(
                                                            model => {
                                                                // Disabled all models expect for fast models
                                                                if (
                                                                    !model.tags.includes(ModelTag.Speed)
                                                                ) {
                                                                    return { ...model, disabled: false }
                                                                }
                                                                return model
                                                            }
                                                        )
                                                        console.log(
                                                            '[julia] re-enabled all the models in sync.ts'
                                                        )
                                                        const originalModel = data.primaryModels.find(
                                                            model =>
                                                                model.id === CHAT_MODEL_BEFORE_RATE_LIMIT
                                                        )
                                                        if (originalModel && data.preferences) {
                                                            // Create a full preferences object with both defaults and selected
                                                            data.preferences.defaults.chat =
                                                                originalModel.id
                                                            telemetryRecorder.recordEvent(
                                                                'cody.rateLimit',
                                                                'hit',
                                                                {
                                                                    privateMetadata: {
                                                                        feature: 'chat',
                                                                        rateLimitedModel:
                                                                            originalModel.id,
                                                                    },
                                                                }
                                                            )
                                                            console.log(
                                                                '[julia] set model to gemini flash in sync.ts'
                                                            )
                                                        }
                                                    }
                                                }
                                                return Observable.of(data)
                                            }
                                        )
                                    )
                                })
                            )
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
                        return configOverwrites.pipe(
                            map((configOverwrites): RemoteModelsData | typeof pendingOperation => {
                                if (configOverwrites === pendingOperation) {
                                    return pendingOperation
                                }
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
                            })
                        )
                    })
                )
                return serverModelsConfig
            })
        )

    return combineLatest(localModels, remoteModelsData, userModelPreferences).pipe(
        map(
            ([localModels, remoteModelsData, userModelPreferences]):
                | ModelsData
                | typeof pendingOperation =>
                remoteModelsData === pendingOperation
                    ? pendingOperation
                    : {
                          localModels,
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
        ),
        distinctUntilChanged(),
        tap(modelsData => {
            if (modelsData !== pendingOperation && modelsData.primaryModels.length > 0) {
                logDebug(
                    'ModelsService',
                    'ModelsData changed',
                    `${modelsData.primaryModels.length} primary models`
                )
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
    const client = new RestClient(config.auth, config.configuration.customHeaders)
    return await client.getAvailableModels(signal)
}

/**
 * Adjusts context windows for models based on user tier and model characteristics.
 *
 * This function:
 * 1. Applies tokenizer-specific adjustments (e.g., for Mistral models)
 * 2. Enforces tier-specific context window limits (free, pro, enterprise)
 * 3. Sets appropriate output token limits based on model capabilities
 *
 * @param models - Array of models to adjust
 * @param isPro - Whether the user has a pro subscription
 * @param isFree - Whether the user has a free subscription
 * @returns Array of models with adjusted context windows
 */
export const maybeAdjustContextWindows = (
    models: ServerModel[],
    config: { tier: 'free' | 'pro' | 'enterprise'; longContextWindowFlagEnabled: boolean }
): ServerModel[] => {
    // Compile regex once
    const mistralRegex = /^mi(x|s)tral/
    // Determine token limits based on config once outside the loop
    const isFreeTier = config.tier === 'free'
    const isProTier = config.tier === 'pro'

    // Apply restrictions to all models
    return models.map(model => {
        let { maxInputTokens, maxOutputTokens } = model.contextWindow

        // Apply Mistral-specific adjustment
        if (mistralRegex.test(model.modelName)) {
            // Adjust the context window size for Mistral models because the OpenAI tokenizer undercounts tokens in English
            // compared to the Mistral tokenizer. Based on our observations, the OpenAI tokenizer usually undercounts by about 13%.
            // We reduce the context window by 15% (0.85 multiplier) to provide a safety buffer and prevent potential overflow.
            // Note: In other languages, the OpenAI tokenizer might actually overcount tokens. As a result, we accept the risk
            // of using a slightly smaller context window than what's available for those languages.
            maxInputTokens = Math.round(maxInputTokens * TOKEN_LIMITS.MISTRAL_ADJUSTMENT_FACTOR)
        }

        /*
            Input window adjustments:
            - The enhanced input window limits are applied to ES and Pro users when the flag is on, and we set the limits to the highest on the server side.
            - Therefore, we change the input window limits back to the original ones for pro and enterprise users if the flag is off or if
            the user is on the free tier.
        */
        if (isFreeTier || !config.longContextWindowFlagEnabled) {
            maxInputTokens = Math.min(maxInputTokens, TOKEN_LIMITS.ORIGINAL_ALL.MAX_INPUT_TOKENS)
        }

        /*
            Output window adjustments:
            - We set the limits to the highest (ES limits) on the server side, so we need to reduce the limits for pro users and free users.
        */
        if (isProTier) {
            const limit = model.capabilities.includes(ModelTag.Reasoning)
                ? TOKEN_LIMITS.PRO.REASONING_OUTPUT
                : TOKEN_LIMITS.PRO.STANDARD_OUTPUT
            maxOutputTokens = Math.min(maxOutputTokens, limit)
        }
        if (isFreeTier) {
            maxOutputTokens = Math.min(maxOutputTokens, TOKEN_LIMITS.ORIGINAL_ALL.MAX_OUTPUT_TOKENS)
        }

        // Return model with adjusted context window
        return {
            ...model,
            contextWindow: {
                ...model.contextWindow,
                maxInputTokens,
                maxOutputTokens,
            },
        }
    })
}
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

export function handleRateLimitError(error: RateLimitError, feature: string): void {
    console.log(
        '[julia] handleRateLimitError in sync.ts ---- before updating current AuthStatus, feature is',
        feature
    )

    // TODO: disabled the models
    // when u change the default model it triggers sync.ts
    // user log in/out trigger sync.ts
    // add a new field 'ratelimited' in authstatus? rate limited -- update authstatus (new field rate limited)
    // read auth status in sync.ts. if 'ratelimited' is false change the model back
    // if 'ratelimited' is true, change model to flash or other fast models. store the model we had

    // Emit an event that models have been disabled
    // const event = new CustomEvent('cody:models-disabled', {
    //     detail: { until: disableUntil, error },
    // })
    // window.dispatchEvent(event)

    // Update the authStatus to set rateLimited to true
    const currentStatus = currentAuthStatusOrNotReadyYet()
    if (currentStatus?.authenticated) {
        console.log(
            '[julia] handleRateLimitError in sync.ts ---- AuthStatus found, updating field rateLimited, feature is',
            feature
        )
        // Create a new auth status object with rateLimited set to true
        const updatedStatus: AuthStatus = {
            ...currentStatus,
            // Track which feature hit the rate limit
            rateLimited: { ...(currentStatus.rateLimited || {}), [feature]: true },
        }
        console.log('[julia] handleRateLimitError in sync.ts ---- mockAuthStatus, feature is', feature)
        // Update the auth status using mockAuthStatus
        mockAuthStatus(updatedStatus)
    }
}
