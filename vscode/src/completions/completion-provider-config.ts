import {
    type ClientConfiguration,
    FeatureFlag,
    type FeatureFlagProvider,
} from '@sourcegraph/cody-shared'
import type { ContextStrategy } from './context/context-strategy'

class CompletionProviderConfig {
    private _config?: ClientConfiguration

    /**
     * Use the injected feature flag provider to make testing easier.
     */
    private featureFlagProvider?: FeatureFlagProvider

    private flagsToResolve = [
        FeatureFlag.CodyAutocompleteContextBfgMixed,
        FeatureFlag.CodyAutocompleteUserLatency,
        FeatureFlag.CodyAutocompleteTracing,
        FeatureFlag.CodyAutocompleteContextExtendLanguagePool,
        FeatureFlag.CodyAutocompleteHotStreakAndSmartThrottle,
        FeatureFlag.CodyAutocompletePreloadingExperimentBaseFeatureFlag,
        FeatureFlag.CodyAutocompletePreloadingExperimentVariant1,
        FeatureFlag.CodyAutocompletePreloadingExperimentVariant2,
        FeatureFlag.CodyAutocompletePreloadingExperimentVariant3,
    ] as const

    private get config() {
        if (!this._config) {
            throw new Error('CompletionProviderConfig is not initialized')
        }

        return this._config
    }

    /**
     * Should be called before `InlineCompletionItemProvider` instance is created, so that the singleton
     * with resolved values is ready for downstream use.
     */
    public async init(
        config: ClientConfiguration,
        featureFlagProvider: FeatureFlagProvider
    ): Promise<void> {
        this._config = config
        this.featureFlagProvider = featureFlagProvider

        await Promise.all(this.flagsToResolve.map(flag => featureFlagProvider.evaluateFeatureFlag(flag)))
    }

    public setConfig(config: ClientConfiguration) {
        this._config = config
    }

    public getPrefetchedFlag(flag: (typeof this.flagsToResolve)[number]): boolean {
        if (!this.featureFlagProvider) {
            throw new Error('CompletionProviderConfig is not initialized')
        }

        return Boolean(this.featureFlagProvider.getFromCache(flag as FeatureFlag))
    }

    public get contextStrategy(): ContextStrategy {
        switch (this.config.autocompleteExperimentalGraphContext as string) {
            case 'lsp-light':
                return 'lsp-light'
            case 'tsc-mixed':
                return 'tsc-mixed'
            case 'tsc':
                return 'tsc'
            case 'bfg':
                return 'bfg'
            case 'bfg-mixed':
                return 'bfg-mixed'
            case 'jaccard-similarity':
                return 'jaccard-similarity'
            case 'new-jaccard-similarity':
                return 'new-jaccard-similarity'
            default:
                return this.getPrefetchedFlag(FeatureFlag.CodyAutocompleteContextBfgMixed)
                    ? 'bfg-mixed'
                    : 'jaccard-similarity'
        }
    }

    private getPreloadingExperimentGroup(): 'variant1' | 'variant2' | 'variant3' | 'control' {
        // The desired distribution:
        // - Variant-1 25%
        // - Variant-2 25%
        // - Variant-3 25%
        // - Control group 25%
        //
        // The rollout values to set:
        // - CodyAutocompletePreloadingExperimentBaseFeatureFlag 75%
        // - CodyAutocompleteHotStreak 33%
        // - CodyAutocompleteSmartThrottle 100%
        // - CodyAutocompleteSmartThrottleExtended 50%
        if (this.getPrefetchedFlag(FeatureFlag.CodyAutocompletePreloadingExperimentBaseFeatureFlag)) {
            if (this.getPrefetchedFlag(FeatureFlag.CodyAutocompletePreloadingExperimentVariant1)) {
                return 'variant1'
            }

            if (this.getPrefetchedFlag(FeatureFlag.CodyAutocompletePreloadingExperimentVariant2)) {
                if (this.getPrefetchedFlag(FeatureFlag.CodyAutocompletePreloadingExperimentVariant3)) {
                    return 'variant2'
                }
                return 'variant3'
            }
        }

        return 'control'
    }

    public get autocompletePreloadDebounceInterval(): number {
        const localInterval = this.config.autocompleteExperimentalPreloadDebounceInterval

        if (localInterval !== undefined && localInterval > 0) {
            return localInterval
        }

        const preloadingExperimentGroup = this.getPreloadingExperimentGroup()

        switch (preloadingExperimentGroup) {
            case 'variant1':
                return 150
            case 'variant2':
                return 250
            case 'variant3':
                return 350
            default:
                return 0
        }
    }

    private getLatencyExperimentGroup(): 'hot-streak-and-smart-throttle' | 'control' {
        // The desired distribution:
        // - Hot-streak + Smart-throttle 50%
        // - Control group 50%
        //
        // The rollout values to set:
        // - CodyAutocompleteHotStreakAndSmartThrottle 50%
        if (this.getPrefetchedFlag(FeatureFlag.CodyAutocompleteHotStreakAndSmartThrottle)) {
            return 'hot-streak-and-smart-throttle'
        }

        return 'control'
    }

    public get hotStreak(): boolean {
        return (
            this.config.autocompleteExperimentalHotStreakAndSmartThrottle ||
            this.getLatencyExperimentGroup() === 'hot-streak-and-smart-throttle'
        )
    }

    public get smartThrottle(): boolean {
        return (
            this.config.autocompleteExperimentalHotStreakAndSmartThrottle ||
            this.getLatencyExperimentGroup() === 'hot-streak-and-smart-throttle'
        )
    }
}

/**
 * A singleton store for completion provider configuration values which allows us to
 * avoid propagating every feature flag and config value through completion provider
 * internal calls. It guarantees that `flagsToResolve` are resolved on `CompletionProvider`
 * creation and along with `Configuration`.
 *
 * A subset of relevant config values and feature flags is moved here from the existing
 * params waterfall. Ideally, we rely on this singleton as a source of truth for config values
 * and collapse function calls nested in `InlineCompletionItemProvider.generateCompletions()`.
 */
export const completionProviderConfig = new CompletionProviderConfig()
