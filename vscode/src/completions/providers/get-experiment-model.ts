import {
    FeatureFlag,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    mergeMap,
} from '@sourcegraph/cody-shared'

import { Observable, map } from 'observable-fns'
import * as vscode from 'vscode'
import {
    DEEPSEEK_CODER_V2_LITE_BASE,
    DEEPSEEK_CODER_V2_LITE_BASE_DIRECT_ROUTE,
    DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_4096,
    FIREWORKS_DEEPSEEK_7B_LANG_ALL,
    FIREWORKS_DEEPSEEK_7B_LANG_SPECIFIC_V0,
    FIREWORKS_DEEPSEEK_7B_LANG_SPECIFIC_V1,
} from './fireworks'

interface ProviderConfigFromFeatureFlags {
    provider: string
    model?: string
}

export function getExperimentModel(
    isDotCom: boolean
): Observable<ProviderConfigFromFeatureFlags | null> {
    return combineLatest([
        featureFlagProvider.instance!.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteStarCoderHybrid),
        featureFlagProvider.instance!.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteClaude3),
        featureFlagProvider.instance!.evaluatedFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentBaseFeatureFlag
        ),
        featureFlagProvider.instance!.evaluatedFeatureFlag(
            FeatureFlag.CodyAutocompleteDeepseekV2LiteBase
        ),
    ]).pipe(
        mergeMap(([starCoderHybrid, claude3, fimModelExperimentFlag, deepseekV2LiteBase]) => {
            // We run fine tuning experiment for VSC client only.
            // We disable for all agent clients like the JetBrains plugin.
            const isFinetuningExperimentDisabled = vscode.workspace
                .getConfiguration()
                .get<boolean>('cody.advanced.agent.running', false)

            if (!isFinetuningExperimentDisabled && fimModelExperimentFlag && isDotCom) {
                // The traffic in this feature flag is interpreted as a traffic allocated to the fine-tuned experiment.
                return resolveFIMModelExperimentFromFeatureFlags()
            }

            if (isDotCom && deepseekV2LiteBase) {
                return Observable.of({ provider: 'fireworks', model: DEEPSEEK_CODER_V2_LITE_BASE })
            }

            if (starCoderHybrid) {
                return Observable.of({ provider: 'fireworks', model: 'starcoder-hybrid' })
            }

            if (claude3) {
                return Observable.of({
                    provider: 'anthropic',
                    model: 'anthropic/claude-3-haiku-20240307',
                })
            }

            return Observable.of(null)
        }),
        distinctUntilChanged()
    )
}

/**
 * The traffic allocated to the fine-tuned-base feature flag is further split between multiple
 * feature flag in this function.
 */
function resolveFIMModelExperimentFromFeatureFlags(): ReturnType<typeof getExperimentModel> {
    return combineLatest([
        featureFlagProvider.instance!.evaluatedFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentControl
        ),
        featureFlagProvider.instance!.evaluatedFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentVariant1
        ),
        featureFlagProvider.instance!.evaluatedFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentVariant2
        ),
        featureFlagProvider.instance!.evaluatedFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentVariant3
        ),
        featureFlagProvider.instance!.evaluatedFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentVariant4
        ),
        featureFlagProvider.instance!.evaluatedFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentCurrentBest
        ),
    ]).pipe(
        map(
            ([
                fimModelControl,
                fimModelVariant1,
                fimModelVariant2,
                fimModelVariant3,
                fimModelVariant4,
                fimModelCurrentBest,
            ]) => {
                if (fimModelVariant1) {
                    return { provider: 'fireworks', model: DEEPSEEK_CODER_V2_LITE_BASE_DIRECT_ROUTE }
                }
                if (fimModelVariant2) {
                    return { provider: 'fireworks', model: FIREWORKS_DEEPSEEK_7B_LANG_SPECIFIC_V0 }
                }
                if (fimModelVariant3) {
                    return { provider: 'fireworks', model: FIREWORKS_DEEPSEEK_7B_LANG_SPECIFIC_V1 }
                }
                if (fimModelVariant4) {
                    return { provider: 'fireworks', model: FIREWORKS_DEEPSEEK_7B_LANG_ALL }
                }
                if (fimModelCurrentBest) {
                    return { provider: 'fireworks', model: DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_4096 }
                }
                if (fimModelControl) {
                    // Current production model
                    return { provider: 'fireworks', model: DEEPSEEK_CODER_V2_LITE_BASE }
                }

                // Extra free traffic - redirect to the current production model which could be different than control
                return { provider: 'fireworks', model: DEEPSEEK_CODER_V2_LITE_BASE }
            }
        ),
        distinctUntilChanged()
    )
}
