import {
    type AuthStatus,
    type EditModel,
    type EditProvider,
    ModelProvider,
    ModelUsage,
} from '@sourcegraph/cody-shared'
import type { EditIntent } from '../types'

export function getEditModelsForUser(authStatus: AuthStatus): ModelProvider[] {
    return ModelProvider.getProviders(ModelUsage.Edit, !authStatus.userCanUpgrade)
}

export interface EditLLMConfig {
    model: EditModel
    provider: EditProvider
}

/**
 * Gets the overriden model for enterprise users.
 * The only primary change here is that we override to use `fastChatModel`
 * for the "Document" command
 */
export function getOverridenEnterpriseModelForIntent(
    intent: EditIntent,
    currentModel: EditModel,
    currentProvider: EditProvider,
    authStatus: AuthStatus
): EditLLMConfig {
    const provider = authStatus.configOverwrites?.provider || currentProvider

    if (intent === 'doc') {
        return {
            model: authStatus.configOverwrites?.fastChatModel || currentModel,
            provider,
        }
    }

    return {
        model: authStatus.configOverwrites?.chatModel || currentModel,
        provider,
    }
}

export function getOverridenLLMConfigForIntent(
    intent: EditIntent,
    currentModel: EditModel,
    currentProvider: EditProvider,
    authStatus: AuthStatus
): EditLLMConfig {
    if (!authStatus.isDotCom) {
        return getOverridenEnterpriseModelForIntent(intent, currentModel, currentProvider, authStatus)
    }

    switch (intent) {
        case 'fix':
            // Fix is a case where we want to ensure that users do not end up with a broken edit model.
            // It is outside of the typical Edit flow so it is more likely a user could become "stuck" here.
            // TODO: Make the model usage more visible to users outside of the normal edit flow. This means
            // we could let the user provide any model they want for `fix`.
            // Issue: https://github.com/sourcegraph/cody/issues/3512
            return {
                model: 'anthropic/claude-3-sonnet-20240229',
                provider: 'Anthropic',
            }
        case 'doc':
            // Doc is a case where we can sacrifice LLM performnace for improved latency and get comparable results.
            return {
                model: 'anthropic/claude-3-haiku-20240307',
                provider: 'Anthropic',
            }
        case 'test':
        case 'add':
        case 'edit':
            // Support all model usage for add and edit intents.
            return {
                model: currentModel,
                provider: currentProvider,
            }
    }
}
