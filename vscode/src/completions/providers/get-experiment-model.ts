import { FeatureFlag, featureFlagProvider } from '@sourcegraph/cody-shared'

import * as vscode from 'vscode'
import type { AnthropicOptions } from './anthropic'
import {
    DEEPSEEK_CODER_V2_LITE_BASE,
    DEEPSEEK_CODER_V2_LITE_BASE_DIRECT_ROUTE,
    DEEPSEEK_CODER_V2_LITE_BASE_WINDOW_4096,
    FIREWORKS_DEEPSEEK_7B_LANG_ALL,
    FIREWORKS_DEEPSEEK_7B_LANG_SPECIFIC_V0,
    FIREWORKS_DEEPSEEK_7B_LANG_SPECIFIC_V1,
    type FireworksOptions,
} from './fireworks'

interface ProviderConfigFromFeatureFlags {
    provider: string
    model?: FireworksOptions['model'] | AnthropicOptions['model']
}

export async function getExperimentModel(
    isDotCom: boolean
): Promise<ProviderConfigFromFeatureFlags | null> {
    const [starCoderHybrid, claude3, fimModelExperimentFlag, deepseekV2LiteBase] = await Promise.all([
        featureFlagProvider.instance!.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteStarCoderHybrid),
        featureFlagProvider.instance!.evaluateFeatureFlag(FeatureFlag.CodyAutocompleteClaude3),
        featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentBaseFeatureFlag
        ),
        featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteDeepseekV2LiteBase
        ),
    ])

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
        return { provider: 'fireworks', model: DEEPSEEK_CODER_V2_LITE_BASE }
    }

    if (starCoderHybrid) {
        return { provider: 'fireworks', model: 'starcoder-hybrid' }
    }

    if (claude3) {
        return { provider: 'anthropic', model: 'anthropic/claude-3-haiku-20240307' }
    }

    return null
}

async function resolveFIMModelExperimentFromFeatureFlags(): ReturnType<typeof getExperimentModel> {
    /**
     * The traffic allocated to the fine-tuned-base feature flag is further split between multiple feature flag in function.
     */
    const [
        fimModelControl,
        fimModelVariant1,
        fimModelVariant2,
        fimModelVariant3,
        fimModelVariant4,
        fimModelCurrentBest,
    ] = await Promise.all([
        featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentControl
        ),
        featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentVariant1
        ),
        featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentVariant2
        ),
        featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentVariant3
        ),
        featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentVariant4
        ),
        featureFlagProvider.instance!.evaluateFeatureFlag(
            FeatureFlag.CodyAutocompleteFIMModelExperimentCurrentBest
        ),
    ])
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
