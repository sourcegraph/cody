import {
    FeatureFlag,
    type Unsubscribable,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    resolvedConfig,
    switchMap,
} from '@sourcegraph/cody-shared'
import { Observable, map } from 'observable-fns'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import type { ContextStrategy } from './context/context-strategy'

class CompletionProviderConfig {
    private prefetchSubscription: Unsubscribable | undefined

    /**
     * Pre-fetch the feature flags we need so they are cached and immediately available when the
     * user performs their first autocomplete, and so that our performance metrics are not skewed by
     * the 1st autocomplete's feature flag evaluation time.
     */
    public async prefetch(): Promise<void> {
        if (this.prefetchSubscription) {
            // Only one prefetch subscription is needed.
            return
        }
        const featureFlagsUsed: FeatureFlag[] = [
            FeatureFlag.CodyAutocompleteContextExperimentBaseFeatureFlag,
            FeatureFlag.CodyAutocompleteContextExperimentVariant1,
            FeatureFlag.CodyAutocompleteContextExperimentVariant2,
            FeatureFlag.CodyAutocompleteContextExperimentVariant3,
            FeatureFlag.CodyAutocompleteContextExperimentVariant4,
            FeatureFlag.CodyAutocompleteContextExperimentControl,
            FeatureFlag.CodyAutocompleteDataCollectionFlag,
            FeatureFlag.CodyAutocompleteTracing,
        ]
        this.prefetchSubscription = combineLatest(
            ...featureFlagsUsed.map(flag => featureFlagProvider.evaluatedFeatureFlag(flag))
        ).subscribe({})
    }

    public dispose(): void {
        this.prefetchSubscription?.unsubscribe()
    }

    public get contextStrategy(): Observable<ContextStrategy> {
        const knownValues = [
            'lsp-light',
            'tsc-mixed',
            'tsc',
            'jaccard-similarity',
            'new-jaccard-similarity',
            'recent-edits',
            'recent-edits-1m',
            'recent-edits-5m',
            'recent-edits-mixed',
            'recent-copy',
            'diagnostics',
            'recent-view-port',
            'auto-edits',
        ]
        return resolvedConfig.pipe(
            switchMap(({ configuration }) => {
                if (knownValues.includes(configuration.autocompleteExperimentalGraphContext as string)) {
                    return Observable.of(
                        configuration.autocompleteExperimentalGraphContext as ContextStrategy
                    )
                }
                return this.experimentBasedContextStrategy()
            })
        )
    }

    private experimentBasedContextStrategy(): Observable<ContextStrategy> {
        const defaultContextStrategy = 'jaccard-similarity'

        return featureFlagProvider
            .evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteContextExperimentBaseFeatureFlag)
            .pipe(
                switchMap(isContextExperimentFlagEnabled => {
                    if (isRunningInsideAgent() || !isContextExperimentFlagEnabled) {
                        return Observable.of(defaultContextStrategy)
                    }

                    return combineLatest(
                        featureFlagProvider.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentVariant1
                        ),
                        featureFlagProvider.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentVariant2
                        ),
                        featureFlagProvider.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentVariant3
                        ),
                        featureFlagProvider.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentVariant4
                        ),
                        featureFlagProvider.evaluatedFeatureFlag(
                            FeatureFlag.CodyAutocompleteContextExperimentControl
                        )
                    ).pipe(
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

    public get completionDataCollectionFlag(): Observable<boolean> {
        return featureFlagProvider
            .evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteDataCollectionFlag)
            .pipe(distinctUntilChanged())
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
