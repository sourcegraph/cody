import { type Configuration, FeatureFlag, type FeatureFlagProvider } from '@sourcegraph/cody-shared'
import type { ContextStrategy } from './context/context-strategy'

class CompletionProviderConfig {
    private _config?: Configuration

    /**
     * Use the injected feature flag provider to make testing easier.
     */
    private featureFlagProvider?: FeatureFlagProvider

    private flagsToResolve = [
        FeatureFlag.CodyAutocompleteContextBfgMixed,
        FeatureFlag.CodyAutocompleteHotStreak,
        FeatureFlag.CodyAutocompleteUserLatency,
        FeatureFlag.CodyAutocompleteEagerCancellation,
        FeatureFlag.CodyAutocompleteTracing,
        FeatureFlag.CodyAutocompleteSmartThrottle,
        FeatureFlag.CodyAutocompleteReducedDebounce,
        FeatureFlag.CodyAutocompleteContextExtendLanguagePool,
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
    public async init(config: Configuration, featureFlagProvider: FeatureFlagProvider): Promise<void> {
        this._config = config
        this.featureFlagProvider = featureFlagProvider

        await Promise.all(this.flagsToResolve.map(flag => featureFlagProvider.evaluateFeatureFlag(flag)))
    }

    public setConfig(config: Configuration) {
        this._config = config
    }

    // Note: We add the literal value of the extended language pool flag to the argument list to
    // avoid the callsites having to import the FeatureFlag enum from lib/shared. This is necessary
    // because we run some integration tests that depend on them and that somehow can not import
    // from lib/shared without failing CI.
    public getPrefetchedFlag(
        flag: (typeof this.flagsToResolve)[number] | 'cody-autocomplete-context-extend-language-pool'
    ): boolean {
        if (!this.featureFlagProvider) {
            throw new Error('CompletionProviderConfig is not initialized')
        }

        return Boolean(this.featureFlagProvider.getFromCache(flag as FeatureFlag))
    }

    public get hotStreak(): boolean {
        return (
            this.config.autocompleteExperimentalHotStreak ||
            this.getPrefetchedFlag(FeatureFlag.CodyAutocompleteHotStreak)
        )
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

    public get smartThrottle(): boolean {
        return (
            // smart throttle is required for the bfg-mixed context strategy
            // because it allows us to update the completion based on the identifiers
            // user typed in the current line.
            this.contextStrategy === 'bfg-mixed' ||
            this.config.autocompleteExperimentalSmartThrottle ||
            this.getPrefetchedFlag(FeatureFlag.CodyAutocompleteSmartThrottle)
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
