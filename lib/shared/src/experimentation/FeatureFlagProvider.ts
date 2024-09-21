import { Observable, Subject, interval, map } from 'observable-fns'
import { authStatus } from '../auth/authStatus'
import type { AuthStatus, AuthenticatedAuthStatus } from '../auth/types'
import { logError } from '../logger'
import {
    combineLatest,
    concat,
    debounceTime,
    distinctUntilChanged,
    firstValueFrom,
    promiseFactoryToObservable,
    shareReplay,
    startWith,
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
    // Enable the FineTuned model as the default model via Fireworks
    CodyAutocompleteFIMFineTunedModelHybrid = 'cody-autocomplete-fim-fine-tuned-model-hybrid',
    // Enable the deepseek-v2 as the default model via Fireworks
    CodyAutocompleteDeepseekV2LiteBase = 'cody-autocomplete-deepseek-v2-lite-base',

    // Enable various feature flags to experiment with FIM trained fine-tuned models via Fireworks
    CodyAutocompleteFIMModelExperimentBaseFeatureFlag = 'cody-autocomplete-fim-model-experiment-flag-v2',
    CodyAutocompleteFIMModelExperimentControl = 'cody-autocomplete-fim-model-experiment-control-v2',
    CodyAutocompleteFIMModelExperimentCurrentBest = 'cody-autocomplete-fim-model-experiment-current-best-v2',
    CodyAutocompleteFIMModelExperimentVariant1 = 'cody-autocomplete-fim-model-experiment-variant-1-v2',
    CodyAutocompleteFIMModelExperimentVariant2 = 'cody-autocomplete-fim-model-experiment-variant-2-v2',
    CodyAutocompleteFIMModelExperimentVariant3 = 'cody-autocomplete-fim-model-experiment-variant-3-v2',
    CodyAutocompleteFIMModelExperimentVariant4 = 'cody-autocomplete-fim-model-experiment-variant-4-v2',
    CodyAutocompleteDisableLowPerfLangDelay = 'cody-autocomplete-disable-low-perf-lang-delay',
    // Enables Claude 3 if the user is in our holdout group
    CodyAutocompleteClaude3 = 'cody-autocomplete-claude-3',
    // Enable latency adjustments based on accept/reject streaks
    CodyAutocompleteUserLatency = 'cody-autocomplete-user-latency',

    CodyAutocompletePreloadingExperimentBaseFeatureFlag = 'cody-autocomplete-preloading-experiment-flag',
    CodyAutocompletePreloadingExperimentVariant1 = 'cody-autocomplete-preloading-experiment-variant-1',
    CodyAutocompletePreloadingExperimentVariant2 = 'cody-autocomplete-preloading-experiment-variant-2',
    CodyAutocompletePreloadingExperimentVariant3 = 'cody-autocomplete-preloading-experiment-variant-3',

    CodyAutocompleteContextExperimentBaseFeatureFlag = 'cody-autocomplete-context-experiment-flag',
    CodyAutocompleteContextExperimentVariant1 = 'cody-autocomplete-context-experiment-variant-1',
    CodyAutocompleteContextExperimentVariant2 = 'cody-autocomplete-context-experiment-variant-2',
    CodyAutocompleteContextExperimentVariant3 = 'cody-autocomplete-context-experiment-variant-3',
    CodyAutocompleteContextExperimentVariant4 = 'cody-autocomplete-context-experiment-variant-4',
    CodyAutocompleteContextExperimentControl = 'cody-autocomplete-context-experiment-control',

    // When enabled, it will extend the number of languages considered for context (e.g. React files
    // will be able to use CSS files as context).
    CodyAutocompleteContextExtendLanguagePool = 'cody-autocomplete-context-extend-language-pool',

    // use-ssc-for-cody-subscription is a feature flag that enables the use of SSC as the source of truth for Cody subscription data.
    UseSscForCodySubscription = 'use-ssc-for-cody-subscription',

    // cody-pro-trial-ended is a feature flag that indicates if the Cody Pro "Free Trial"  has ended.
    // (Enabling users to use Cody Pro for free for 3-months starting in late Q4'2023.)
    CodyProTrialEnded = 'cody-pro-trial-ended',

    /** Interactive tutorial, primarily for onboarding */
    CodyInteractiveTutorial = 'cody-interactive-tutorial',

    /** Whether to use generated metadata to power embeddings. */
    CodyEmbeddingsGenerateMetadata = 'cody-embeddings-generate-metadata',

    /** Whether to use server-side Context API. */
    CodyServerSideContextAPI = 'cody-server-side-context-api-enabled',

    /** Whether to use intent detection API. */
    CodyIntentDetectionAPI = 'cody-intent-detection-api',

    GitMentionProvider = 'git-mention-provider',

    /** Enable experimental One Box feature in Cody */
    CodyExperimentalOneBox = 'cody-experimental-one-box',

    /** Whether user has access to early-acess models. */
    CodyEarlyAccess = 'cody-early-access',
}

const ONE_HOUR = 60 * 60 * 1000

export interface FeatureFlagProvider {
    evaluateFeatureFlag(flag: FeatureFlag): Promise<boolean>
    evaluatedFeatureFlag(flag: FeatureFlag): Observable<boolean>
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
    private refreshes: Observable<void> = combineLatest([
        this.refreshRequests.pipe(startWith(undefined)),
        interval(ONE_HOUR).pipe(startWith(undefined)),
    ]).pipe(map(() => undefined))

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

    private evaluatedFeatureFlags: Observable<Record<string, boolean>> = combineLatest([
        this.relevantAuthStatusChanges,
        this.refreshes,
    ]).pipe(
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

    public async evaluateFeatureFlag(flagName: FeatureFlag): Promise<boolean> {
        return wrapInActiveSpan(`FeatureFlagProvider.evaluateFeatureFlag.${flagName}`, () =>
            firstValueFrom(this.evaluatedFeatureFlag(flagName))
        )
    }

    /**
     * Observe the evaluated value of a feature flag.
     */
    public evaluatedFeatureFlag(flagName: FeatureFlag): Observable<boolean> {
        // Whenever the auth status changes, we need to call `evaluateFeatureFlag` on the GraphQL
        // endpoint, because our endpoint or authentication may have changed, and
        // `getEvaluatedFeatureFlags` only returns the set of recently evaluated feature flags.
        return combineLatest([this.relevantAuthStatusChanges, this.refreshes])
            .pipe(
                switchMap(([authStatus]) =>
                    concat(
                        promiseFactoryToObservable(async signal => {
                            if (process.env.DISABLE_FEATURE_FLAGS) {
                                return false
                            }

                            const cachedValue = this.cache[authStatus.endpoint]?.[flagName.toString()]
                            if (cachedValue !== undefined) {
                                // We'll immediately return the cached value and then start observing
                                // for updates.
                                return cachedValue
                            }

                            const result = await graphqlClient.evaluateFeatureFlag(flagName, signal)
                            return isError(result) ? false : result ?? false
                        }),
                        this.evaluatedFeatureFlags.pipe(
                            map(featureFlags => Boolean(featureFlags[flagName.toString()]))
                        )
                    )
                )
            )
            .pipe(distinctUntilChanged())
    }

    public refresh(): void {
        this.refreshRequests.next()
    }
}

const noopFeatureFlagProvider: FeatureFlagProvider = {
    evaluateFeatureFlag: async () => false,
    evaluatedFeatureFlag: () => Observable.of(false),
    getExposedExperiments: () => ({}),
    refresh: () => {},
}

export const featureFlagProvider = process.env.DISABLE_FEATURE_FLAGS
    ? noopFeatureFlagProvider
    : new FeatureFlagProviderImpl()
