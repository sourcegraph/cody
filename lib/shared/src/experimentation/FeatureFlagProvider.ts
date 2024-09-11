import { Observable } from 'observable-fns'
import type { Event } from 'vscode'
import { currentResolvedConfig, resolvedConfig } from '../configuration/resolver'
import { logDebug } from '../logger'
import { type Unsubscribable, distinctUntilChanged, fromVSCodeEvent, pluck } from '../misc/observable'
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

export class FeatureFlagProvider {
    // The exposed feature flags are one where the backend returns a non-null value and thus we know
    // the user is in either the test or control group.
    //
    // The first key maps to the endpoint so that we do never cache the wrong flag for different
    // endpoints
    private exposedFeatureFlags: Record<string, Record<string, boolean>> = {}
    private lastRefreshTimestamp = 0
    // Unexposed feature flags are cached differently since they don't usually mean that the backend
    // won't have access to this feature flag. Those will not automatically update when feature
    // flags are updated in the background.
    private unexposedFeatureFlags: Record<string, Set<string>> = {}

    private subscriptionsForEndpoint: Map<
        string, // ${endpoint}#${prefix filter}
        { lastSnapshot: Record<string, boolean>; callbacks: Set<() => void> }
    > = new Map()
    // When we have at least one subscription, ensure that we also periodically refresh the flags
    private nextRefreshTimeout: NodeJS.Timeout | number | undefined = undefined

    private cachedServerEndpoint: string | null = null

    private configSubscription: Unsubscribable

    constructor() {
        // Refresh when auth (endpoint or token) changes.
        this.configSubscription = resolvedConfig
            .pipe(pluck('auth'), distinctUntilChanged())
            .subscribe(auth => {
                this.cachedServerEndpoint = auth.serverEndpoint
                this.refresh()
            })
    }

    /**
     * Get a flag's value from the cache. The returned value could be stale. You must have
     * previously called {@link FeatureFlagProvider.evaluateFeatureFlag} or
     * {@link FeatureFlagProvider.evaluatedFeatureFlag} to ensure that this feature flag's value is
     * present in the cache. For that reason, this method is private because it is easy for external
     * callers to mess that up when calling it.
     */
    private getFromCache(flagName: FeatureFlag): boolean | undefined {
        void this.refreshIfStale()

        if (!this.cachedServerEndpoint) {
            return undefined
        }

        const exposedValue = this.exposedFeatureFlags[this.cachedServerEndpoint]?.[flagName]
        if (exposedValue !== undefined) {
            return exposedValue
        }

        if (this.unexposedFeatureFlags[this.cachedServerEndpoint]?.has(flagName)) {
            return false
        }

        return undefined
    }

    public getExposedExperiments(): Record<string, boolean> {
        if (!this.cachedServerEndpoint) {
            return {}
        }
        return this.exposedFeatureFlags[this.cachedServerEndpoint] || {}
    }

    public async evaluateFeatureFlag(flagName: FeatureFlag): Promise<boolean> {
        return wrapInActiveSpan(`FeatureFlagProvider.evaluateFeatureFlag.${flagName}`, async () => {
            if (process.env.DISABLE_FEATURE_FLAGS) {
                return false
            }

            const {
                auth: { serverEndpoint: endpoint },
            } = await currentResolvedConfig()

            const cachedValue = this.getFromCache(flagName)
            if (cachedValue !== undefined) {
                return cachedValue
            }

            const value = await graphqlClient.evaluateFeatureFlag(flagName)

            if (value === null || typeof value === 'undefined' || isError(value)) {
                // The backend does not know about this feature flag, so we can't know if the user
                // is in the test or control group.
                if (!this.unexposedFeatureFlags[endpoint]) {
                    this.unexposedFeatureFlags[endpoint] = new Set()
                }
                this.unexposedFeatureFlags[endpoint].add(flagName)
                return false
            }

            if (!this.exposedFeatureFlags[endpoint]) {
                this.exposedFeatureFlags[endpoint] = {}
            }
            this.exposedFeatureFlags[endpoint][flagName] = value
            return value
        })
    }

    /**
     * Observe the evaluated value of a feature flag.
     */
    public evaluatedFeatureFlag(flagName: FeatureFlag): Observable<boolean | undefined> {
        if (process.env.DISABLE_FEATURE_FLAGS) {
            return Observable.of(undefined)
        }

        const onChangeEvent: Event<boolean | undefined> = (
            listener: (value: boolean | undefined) => void
        ) => {
            const dispose = this.onFeatureFlagChanged(() => listener(this.getFromCache(flagName)))
            return { dispose }
        }
        return fromVSCodeEvent(onChangeEvent, () => this.evaluateFeatureFlag(flagName)).pipe(
            distinctUntilChanged()
        )
    }

    public async refresh(): Promise<void> {
        this.exposedFeatureFlags = {}
        this.unexposedFeatureFlags = {}
        await this.refreshFeatureFlags()
    }

    private async refreshIfStale(): Promise<void> {
        const now = Date.now()
        if (now - this.lastRefreshTimestamp > ONE_HOUR) {
            // Cache expired, refresh
            await this.refreshFeatureFlags()
        }
    }

    private async refreshFeatureFlags(): Promise<void> {
        return wrapInActiveSpan('FeatureFlagProvider.refreshFeatureFlags', async () => {
            const {
                auth: { serverEndpoint: endpoint },
            } = await currentResolvedConfig()
            const data = process.env.DISABLE_FEATURE_FLAGS
                ? {}
                : await graphqlClient.getEvaluatedFeatureFlags()

            this.exposedFeatureFlags[endpoint] = isError(data) ? {} : data

            this.lastRefreshTimestamp = Date.now()
            this.notifyFeatureFlagChanged()

            if (this.nextRefreshTimeout) {
                clearTimeout(this.nextRefreshTimeout)
                this.nextRefreshTimeout = undefined
            }
            if (this.subscriptionsForEndpoint.size > 0) {
                this.nextRefreshTimeout = setTimeout(() => this.refreshFeatureFlags(), ONE_HOUR)
            }
        })
    }

    /**
     * Allows you to subscribe to a change event that is triggered when feature flags change that
     * the user is currently exposed to.
     *
     * Note this will only update feature flags that a user is currently exposed to. For feature
     * flags not defined upstream, the changes will require a new call to
     * {@link FeatureFlagProvider.evaluateFeatureFlag} or
     * {@link FeatureFlagProvider.evaluatedFeatureFlag} to be picked up.
     */
    private onFeatureFlagChanged(callback: () => void): () => void {
        const endpoint = this.cachedServerEndpoint
        if (!endpoint) {
            throw new Error(
                'FeatureFlagProvider.onFeatureFlagChanged called before server endpoint is set'
            )
        }

        const subscription = this.subscriptionsForEndpoint.get(endpoint)
        if (subscription) {
            subscription.callbacks.add(callback)
            return () => subscription.callbacks.delete(callback)
        }
        this.subscriptionsForEndpoint.set(endpoint, {
            lastSnapshot: this.computeFeatureFlagSnapshot(endpoint),
            callbacks: new Set([callback]),
        })

        if (!this.nextRefreshTimeout) {
            this.nextRefreshTimeout = setTimeout(() => {
                this.nextRefreshTimeout = undefined
                void this.refreshFeatureFlags()
            }, ONE_HOUR)
        }

        return () => {
            const subscription = this.subscriptionsForEndpoint.get(endpoint)
            if (subscription) {
                subscription.callbacks.delete(callback)
                if (subscription.callbacks.size === 0) {
                    this.subscriptionsForEndpoint.delete(endpoint)
                }

                if (this.subscriptionsForEndpoint.size === 0 && this.nextRefreshTimeout) {
                    clearTimeout(this.nextRefreshTimeout)
                    this.nextRefreshTimeout = undefined
                }
            }
        }
    }

    private notifyFeatureFlagChanged(): void {
        const callbacksToTrigger: (() => void)[] = []
        for (const [endpoint, subs] of this.subscriptionsForEndpoint) {
            const currentSnapshot = this.computeFeatureFlagSnapshot(endpoint)
            // We only care about flags being changed that we previously already captured. A new
            // evaluation should not trigger a change event unless that new value is later changed.
            if (
                subs.lastSnapshot === NO_FLAGS ||
                computeIfExistingFlagChanged(subs.lastSnapshot, currentSnapshot)
            ) {
                for (const callback of subs.callbacks) {
                    callbacksToTrigger.push(callback)
                }
            }
            subs.lastSnapshot = currentSnapshot
        }
        // Disable on CI to unclutter the output.
        if (!process.env.VITEST) {
            logDebug('featureflag', 'refreshed')
        }
        for (const callback of callbacksToTrigger) {
            callback()
        }
    }

    private computeFeatureFlagSnapshot(endpoint: string): Record<string, boolean> {
        return this.exposedFeatureFlags[endpoint] ?? NO_FLAGS
    }

    public dispose(): void {
        if (this.nextRefreshTimeout) {
            clearTimeout(this.nextRefreshTimeout)
            this.nextRefreshTimeout = undefined
        }
        this.configSubscription.unsubscribe()
    }
}

const NO_FLAGS: Record<string, never> = {}

export const featureFlagProvider = new FeatureFlagProvider()

function computeIfExistingFlagChanged(
    oldFlags: Record<string, boolean>,
    newFlags: Record<string, boolean>
): boolean {
    return Object.keys(oldFlags).some(key => oldFlags[key] !== newFlags[key])
}
