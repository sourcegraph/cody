import { Observable, Subject, interval, map } from 'observable-fns'
import { authStatus } from '../auth/authStatus'
import type { AuthStatus, AuthenticatedAuthStatus } from '../auth/types'
import { logError } from '../logger'
import {
    type StoredLastValue,
    combineLatest,
    concat,
    debounceTime,
    distinctUntilChanged,
    firstValueFrom,
    promiseFactoryToObservable,
    shareReplay,
    startWith,
    storeLastValue,
    switchMap,
} from '../misc/observable'
import { graphqlClient } from '../sourcegraph-api/graphql'
import { wrapInActiveSpan } from '../tracing'
import { isError } from '../utils'

export enum FeatureFlag {
    // This flag is only used for testing the behavior of the provider and should not be used in
    // product code
    TestFlagDoNotUse = 'test-flag-do-not-use',

    // Enable both-client side and server-side tracing
    CodyAutocompleteTracing = 'cody-autocomplete-tracing',
    // This flag is used to track the overall eligibility to use the StarCoder model. The `-hybrid`
    // suffix is no longer relevant
    CodyAutocompleteStarCoderHybrid = 'cody-autocomplete-default-starcoder-hybrid',
    // Enable the deepseek-v2 as the default model via Fireworks
    CodyAutocompleteDeepseekV2LiteBase = 'cody-autocomplete-deepseek-v2-lite-base',

    // Data collection variants used for completions and next edit completions
    CodyAutocompleteDataCollectionFlag = 'cody-autocomplete-logs-collection-flag',
    SmartApplyContextDataCollectionFlag = 'cody-smart-apply-context-logs-collection-flag',
    EditContextDataCollectionFlag = 'cody-edit-context-logs-collection-flag',

    // Enables fast-path HTTP client for PLG-users
    CodyAutocompleteFastPath = 'cody-autocomplete-fast-path',

    // Enable various feature flags to experiment with FIM trained fine-tuned models via Fireworks
    CodyAutocompleteFIMModelExperimentBaseFeatureFlag = 'cody-autocomplete-model-v2-experiment-flag',
    CodyAutocompleteFIMModelExperimentControl = 'cody-autocomplete-model-experiment-control',
    CodyAutocompleteFIMModelExperimentCurrentBest = 'cody-autocomplete-model-experiment-current-best',
    CodyAutocompleteFIMModelExperimentVariant1 = 'cody-autocomplete-model-experiment-variant-1',
    CodyAutocompleteFIMModelExperimentVariant2 = 'cody-autocomplete-model-experiment-variant-2',
    CodyAutocompleteFIMModelExperimentVariant3 = 'cody-autocomplete-model-experiment-variant-3',
    CodyAutocompleteFIMModelExperimentVariant4 = 'cody-autocomplete-model-experiment-variant-4',

    CodyAutocompleteContextExperimentBaseFeatureFlag = 'cody-autocomplete-context-experiment-flag',
    CodyAutocompleteContextExperimentVariant1 = 'cody-autocomplete-context-experiment-variant-1',
    CodyAutocompleteContextExperimentVariant2 = 'cody-autocomplete-context-experiment-variant-2',
    CodyAutocompleteContextExperimentVariant3 = 'cody-autocomplete-context-experiment-variant-3',
    CodyAutocompleteContextExperimentVariant4 = 'cody-autocomplete-context-experiment-variant-4',
    CodyAutocompleteContextExperimentControl = 'cody-autocomplete-context-experiment-control',

    CodySmartApplyExperimentEnabledFeatureFlag = 'cody-smart-apply-experiment-enabled-flag',
    CodySmartApplyExperimentVariant1 = 'cody-smart-apply-experiment-variant-1',

    CodyAutoEditExperimentEnabledFeatureFlag = 'cody-autoedit-experiment-enabled-flag',

    // Enables gpt-4o-mini as a default Edit model
    CodyEditDefaultToGpt4oMini = 'cody-edit-default-to-gpt-4o-mini',

    // Enables Claude 3.5 Haiku as a default Chat model
    CodyChatDefaultToClaude35Haiku = 'cody-chat-default-to-claude-3-5-haiku',

    // use-ssc-for-cody-subscription is a feature flag that enables the use of SSC as the source of truth for Cody subscription data.
    UseSscForCodySubscription = 'use-ssc-for-cody-subscription',

    // cody-pro-trial-ended is a feature flag that indicates if the Cody Pro "Free Trial"  has ended.
    // (Enabling users to use Cody Pro for free for 3-months starting in late Q4'2023.)
    CodyProTrialEnded = 'cody-pro-trial-ended',

    /** Interactive tutorial, primarily for onboarding */
    CodyInteractiveTutorial = 'cody-interactive-tutorial',

    GitMentionProvider = 'git-mention-provider',

    /** Enable debug mode for One Box feature in Cody */
    CodyExperimentalOneBoxDebug = 'cody-experimental-one-box-debug',
    /** Enable use of new prosemirror prompt editor */
    CodyExperimentalPromptEditor = 'cody-experimental-prompt-editor',

    /** Show Edit Code option in the Cody message submit dropdown */
    CodyExperimentalShowEditCodeIntent = 'cody-experimental-show-edit-code-intent',

    /** Whether user has access to early-acess models. */
    CodyEarlyAccess = 'cody-early-access',

    /**
     * Enables experimental unified prompts (show no commands and include
     * some standard out-of-the-box prompts like documentation and explain code prompts)
     */
    CodyUnifiedPrompts = 'cody-unified-prompts',
    CodyDeepSeekChat = 'cody-deepseek-chat',

    /**
     * For internal use only. New Prompts UI and logic is behind this feature flag
     * will be removed as soon as commands will be deprecated.
     */
    CodyPromptsV2 = 'prompt-creation-v2',

    // Enables Anthropic's prompt caching feature on messages for Cody Clients
    CodyPromptCachingOnMessages = 'cody-prompt-caching-on-messages',

    /** Whether user has access to the experimental agentic chat (fka Deep Cody) feature.
     * This replaces the old 'cody-deep-reflection' & 'deep-cody' that was used for internal testing.
     */
    DeepCody = 'agentic-chat-experimental',

    /** Enable terminal access for agentic context */
    DeepCodyShellContext = 'agentic-chat-cli-tool-experimental',

    /** Whether Context Agent (Deep Cody) should use the default chat model or 3.5 Haiku */
    ContextAgentDefaultChatModel = 'agentic-chat-use-default-chat-model',

    /** Enable Rate Limit for Deep Cody */
    DeepCodyRateLimitBase = 'deep-cody-experimental-rate-limit',
    DeepCodyRateLimitMultiplier = 'deep-cody-experimental-rate-limit-multiplier',
    /** Enable Rate Limit per chat session for agentic chat */
    AgenticContextSessionLimit = 'agentic-chat-experimental-session-limit',

    /**
     * Whether the current repo context chip is shown in the chat input by default
     */
    NoDefaultRepoChip = 'no-default-repo-chip',

    /**
     * Whether the user will see the CTA about upgrading to Sourcegraph Teams
     */
    SourcegraphTeamsUpgradeCTA = 'teams-upgrade-available-cta',
}

const ONE_HOUR = 60 * 60 * 1000

export interface FeatureFlagProvider {
    /**
     * Watch a feature flag's value.
     *
     * This is the preferred way to read feature flags because it means that users do not need to
     * reload their editor to get the changed behavior if the feature flag value changes on the
     * server.
     */
    evaluatedFeatureFlag(flag: FeatureFlag): Observable<boolean>

    /**
     * Get a feature flag's current value once by performing a roundtrip to the server. The caller
     * MUST treat the value as ephemeral (i.e., only valid at the instant it was fetched).
     *
     * @deprecated Use {@link FeatureFlagProvider.evaluatedFeatureFlag} instead. It's important to
     * *watch* feature flag values and change behavior if the feature flag value changes, not just
     * to read the value once (and require the user to reload their editor, for example, to pick up
     * new behavior).
     */
    evaluateFeatureFlagEphemerally(flag: FeatureFlag): Promise<boolean>

    getExposedExperiments(serverEndpoint: string): Record<string, boolean>
    refresh(): void
}

export class FeatureFlagProviderImpl implements FeatureFlagProvider {
    /**
     * The cached exposed feature flags are ones where the backend returns a non-null value and thus
     * we know the user is in either the test or control group.
     *
     * The first key maps to the endpoint so that we never cache the wrong flag for different
     * endpoints.
     */
    private cache: Record<string, Record<string, boolean>> = {}

    private refreshRequests = new Subject<void>()
    private refreshes: Observable<void> = combineLatest(
        this.refreshRequests.pipe(startWith(undefined)),
        interval(ONE_HOUR).pipe(startWith(undefined))
    ).pipe(map(() => undefined))

    private relevantAuthStatusChanges: Observable<
        Pick<AuthStatus, 'authenticated' | 'endpoint'> &
            Partial<Pick<AuthenticatedAuthStatus, 'username'>>
    > = authStatus.pipe(
        map(authStatus => ({
            authenticated: authStatus.authenticated,
            endpoint: authStatus.endpoint,
            username: authStatus.authenticated ? authStatus.username : undefined,
        })),
        distinctUntilChanged()
    )

    private evaluatedFeatureFlags: Observable<Record<string, boolean>> = combineLatest(
        this.relevantAuthStatusChanges,
        this.refreshes
    ).pipe(
        debounceTime(0),
        switchMap(([authStatus]) =>
            promiseFactoryToObservable(signal =>
                process.env.DISABLE_FEATURE_FLAGS
                    ? Promise.resolve({})
                    : graphqlClient.getEvaluatedFeatureFlags(signal)
            ).pipe(
                map(resultOrError => {
                    if (isError(resultOrError)) {
                        logError(
                            'FeatureFlagProvider',
                            'Failed to get all evaluated feature flags',
                            resultOrError
                        )
                    }

                    // Cache so that FeatureFlagProvider.getExposedExperiments can return these synchronously.
                    const result = isError(resultOrError) ? {} : resultOrError
                    this.cache[authStatus.endpoint] = result
                    return result
                })
            )
        ),
        distinctUntilChanged(),
        shareReplay()
    )

    public getExposedExperiments(serverEndpoint: string): Record<string, boolean> {
        return this.cache[serverEndpoint] || {}
    }

    /**
     * @deprecated See {@link FeatureFlagProvider.evaluateFeatureFlagEphemerally} for notes. Use
     * {@link FeatureFlagProvider.evaluatedFeatureFlag} instead.
     */
    public async evaluateFeatureFlagEphemerally(flagName: FeatureFlag): Promise<boolean> {
        return wrapInActiveSpan(`FeatureFlagProvider.evaluateFeatureFlag.${flagName}`, () =>
            firstValueFrom(this.evaluatedFeatureFlag(flagName))
        )
    }

    private evaluatedFeatureFlagCache: Partial<Record<FeatureFlag, StoredLastValue<boolean>>> = {}

    /**
     * Observe the evaluated value of a feature flag.
     */
    public evaluatedFeatureFlag(flagName: FeatureFlag): Observable<boolean> {
        let entry = this.evaluatedFeatureFlagCache[flagName]

        if (!entry) {
            // Whenever the auth status changes, we need to call `evaluateFeatureFlag` on the GraphQL
            // endpoint, because our endpoint or authentication may have changed, and
            // `getEvaluatedFeatureFlags` only returns the set of recently evaluated feature flags.
            entry = storeLastValue(
                combineLatest(this.relevantAuthStatusChanges, this.refreshes)
                    .pipe(
                        // NOTE(sqs): Use switchMap instead of switchMapReplayOperation because we want
                        // to cache the previous value while we are refreshing it. That is a choice that
                        // may not always be correct, but it's probably more desirable for more feature
                        // flags. We can make the cache retrieval behavior configurable if needed.
                        switchMap(([authStatus]) =>
                            concat(
                                promiseFactoryToObservable(async signal => {
                                    if (process.env.DISABLE_FEATURE_FLAGS) {
                                        return false
                                    }

                                    const cachedValue =
                                        this.cache[authStatus.endpoint]?.[flagName.toString()]
                                    if (cachedValue !== undefined) {
                                        // We'll immediately return the cached value and then start observing
                                        // for updates.
                                        return cachedValue
                                    }

                                    const result = await graphqlClient.evaluateFeatureFlag(
                                        flagName,
                                        signal
                                    )
                                    return isError(result) ? false : result ?? false
                                }),
                                this.evaluatedFeatureFlags.pipe(
                                    map(featureFlags => Boolean(featureFlags[flagName.toString()]))
                                )
                            )
                        )
                    )
                    .pipe(distinctUntilChanged(), shareReplay())
            )
            this.evaluatedFeatureFlagCache[flagName] = entry
        }

        return entry.observable
    }

    public refresh(): void {
        this.refreshRequests.next()
    }

    public dispose(): void {
        for (const [, entry] of Object.entries(this.evaluatedFeatureFlagCache)) {
            entry.subscription.unsubscribe()
        }
        this.evaluatedFeatureFlagCache = {}
    }
}

const noopFeatureFlagProvider: FeatureFlagProvider = {
    evaluateFeatureFlagEphemerally: async () => false,
    evaluatedFeatureFlag: () => Observable.of(false),
    getExposedExperiments: () => ({}),
    refresh: () => {},
}

export const featureFlagProvider = process.env.DISABLE_FEATURE_FLAGS
    ? noopFeatureFlagProvider
    : new FeatureFlagProviderImpl()
