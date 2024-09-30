import {
    type AuthenticatedAuthStatus,
    FeatureFlag,
    combineLatest,
    distinctUntilChanged,
    featureFlagProvider,
    isDotCom,
    switchMap,
} from '@sourcegraph/cody-shared'

import { Observable, map } from 'observable-fns'
import * as vscode from 'vscode'
import {
    DEEPSEEK_CODER_V2_LITE_BASE,
    DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_4096,
    FIREWORKS_DEEPSEEK_7B_LANG_ALL,
    FIREWORKS_DEEPSEEK_7B_LANG_SPECIFIC_V0,
    FIREWORKS_DEEPSEEK_7B_LANG_SPECIFIC_V1,
} from '../fireworks'

interface ProviderConfigFromFeatureFlags {
    provider: string
    model?: string
}

export function getDotComExperimentModel({
    authStatus,
}: {
    authStatus: Pick<AuthenticatedAuthStatus, 'endpoint'>
}): Observable<ProviderConfigFromFeatureFlags | null> {
    if (!isDotCom(authStatus)) {
        // We run model experiments only on DotCom.
        return Observable.of(null)
    }

    return combineLatest([
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteStarCoderHybrid),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteClaude3),
        featureFlagProvider.evaluatedFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentBaseFeatureFlag
        ),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteDeepseekV2LiteBase),
    ]).pipe(
        switchMap(([starCoderHybrid, claude3, fimModelExperimentFlag, deepseekV2LiteBase]) => {
            // We run fine tuning experiment for VSC client only.
            // We disable for all agent clients like the JetBrains plugin.
            const isFinetuningExperimentDisabled = vscode.workspace
                .getConfiguration()
                .get<boolean>('cody.advanced.agent.running', false)

            if (!isFinetuningExperimentDisabled && fimModelExperimentFlag) {
                // The traffic in this feature flag is interpreted as a traffic allocated to the fine-tuned experiment.
                return resolveFIMModelExperimentFromFeatureFlags()
            }

            if (deepseekV2LiteBase) {
                return Observable.of({
                    provider: 'fireworks',
                    model: DEEPSEEK_CODER_V2_LITE_BASE,
                })
            }

            if (starCoderHybrid) {
                return Observable.of({
                    provider: 'fireworks',
                    model: 'starcoder-hybrid',
                })
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
function resolveFIMModelExperimentFromFeatureFlags(): ReturnType<typeof getDotComExperimentModel> {
    return combineLatest([
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentControl),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentVariant1),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentVariant2),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentVariant3),
        featureFlagProvider.evaluatedFeatureFlag(FeatureFlag.CodyAutocompleteFIMModelExperimentVariant4),
        featureFlagProvider.evaluatedFeatureFlag(
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
                    return { provider: 'fireworks', model: DEEPSEEK_CODER_V2_LITE_BASE }
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
