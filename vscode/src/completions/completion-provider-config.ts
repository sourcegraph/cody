import {
    type ClientConfiguration,
    FeatureFlag,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    mergeMap,
} from '@sourcegraph/cody-shared'
import { Observable, map } from 'observable-fns'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import type { ContextStrategy } from './context/context-strategy'

class CompletionProviderConfig {
    private _config?: ClientConfiguration

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
    public async init(config: ClientConfiguration): Promise<void> {
        this._config = config
    }

    public setConfig(config: ClientConfiguration) {
        this._config = config
    }

    public get contextStrategy(): Observable<ContextStrategy> {
        const knownValues = [
            'lsp-light',
            'tsc-mixed',
            'tsc',
            'bfg',
            'bfg-mixed',
            'jaccard-similarity',
            'new-jaccard-similarity',
            'recent-edits',
            'recent-edits-1m',
            'recent-edits-5m',
            'recent-edits-mixed',
        ]
        if (knownValues.includes(this.config.autocompleteExperimentalGraphContext as string)) {
            return Observable.of(this.config.autocompleteExperimentalGraphContext as ContextStrategy)
        }
        return this.experimentBasedContextStrategy()
    }

    private experimentBasedContextStrategy(): Observable<ContextStrategy> {
        const defaultContextStrategy = 'jaccard-similarity'

        return featureFlagProvider
            .instance!.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteContextExperimentBaseFeatureFlag)
            .pipe(
                mergeMap(isContextExperimentFlagEnabled => {
                    if (isRunningInsideAgent() || !isContextExperimentFlagEnabled) {
                        return Observable.of(defaultContextStrategy)
                    }

                    return combineLatest([
                        featureFlagProvider.instance!.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentVariant1
                        ),
                        featureFlagProvider.instance!.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentVariant2
                        ),
                        featureFlagProvider.instance!.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentVariant3
                        ),
                        featureFlagProvider.instance!.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentVariant4
                        ),
                        featureFlagProvider.instance!.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentControl
                        ),
                    ]).pipe(
                        map(([variant1, variant2, variant3, variant4, control]) => {
                            if (variant1) {
                                return 'recent-edits-1m'
                            }
                            if (variant2) {
                                return 'recent-edits-5m'
                            }
                            if (variant3) {
                                return 'recent-edits-mixed'
                            }
                            if (variant4) {
                                return 'none'
                            }
                            if (control) {
                                return defaultContextStrategy
                            }
                            return defaultContextStrategy
                        })
                    )
                }),
                distinctUntilChanged<ContextStrategy>()
            )
    }

    private getPreloadingExperimentGroup(): Observable<
        'variant1' | 'variant2' | 'variant3' | 'control'
    > {
        // The desired distribution:
        // - Variant-1 25%
        // - Variant-2 25%
        // - Variant-3 25%
        // - Control group 25%
        //
        // The rollout values to set:
        // - CodyAutocompletePreloadingExperimentBaseFeatureFlag 75%
        // - CodyAutocompleteVariant1 33%
        // - CodyAutocompleteVariant2 100%
        // - CodyAutocompleteVariant3 50%
        return combineLatest([
            featureFlagProvider.instance!.evaluatedFeatureFlag(
                FeatureFlag.CodyAutocompletePreloadingExperimentBaseFeatureFlag
            ),
            featureFlagProvider.instance!.evaluatedFeatureFlag(
                FeatureFlag.CodyAutocompletePreloadingExperimentVariant1
            ),
            featureFlagProvider.instance!.evaluatedFeatureFlag(
                FeatureFlag.CodyAutocompletePreloadingExperimentVariant2
            ),
            featureFlagProvider.instance!.evaluatedFeatureFlag(
                FeatureFlag.CodyAutocompletePreloadingExperimentVariant3
            ),
        ]).pipe(
            map(([isContextExperimentFlagEnabled, variant1, variant2, variant3]) => {
                if (isContextExperimentFlagEnabled) {
                    if (variant1) {
                        return 'variant1'
                    }

                    if (variant2) {
                        if (variant3) {
                            return 'variant2'
                        }
                        return 'variant3'
                    }
                }

                return 'control'
            }),
            distinctUntilChanged()
        )
    }

    public get autocompletePreloadDebounceInterval(): Observable<number> {
        const localInterval = this.config.autocompleteExperimentalPreloadDebounceInterval

        if (localInterval !== undefined && localInterval > 0) {
            return Observable.of(localInterval)
        }

        return this.getPreloadingExperimentGroup().pipe(
            map(preloadingExperimentGroup => {
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
            }),
            distinctUntilChanged()
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
