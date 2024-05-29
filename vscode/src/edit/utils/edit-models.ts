import { type AuthStatus, type EditModel, ModelProvider, ModelUsage } from '@sourcegraph/cody-shared'
import type { EditIntent } from '../types'

export function getEditModelsForUser(authStatus: AuthStatus): ModelProvider[] {
    return ModelProvider.getProviders(ModelUsage.Edit, !authStatus.userCanUpgrade)
}

/**
 * Gets the overriden model for enterprise users.
 * The only primary change here is that we override to use `fastChatModel`
 * for the "Document" command
 */
export function getOverridenEnterpriseModelForIntent(
    intent: EditIntent,
    currentModel: EditModel,
    authStatus: AuthStatus
): EditModel {
    const model = authStatus.configOverwrites?.chatModel || currentModel
    const fastModel = authStatus.configOverwrites?.fastChatModel || currentModel

    if (intent === 'doc') {
        return fastModel
    }

    return model
}

export function getOverridenModelForIntent(
    intent: EditIntent,
    currentModel: EditModel,
    authStatus: AuthStatus
): EditModel {
    if (!authStatus.isDotCom) {
        return getOverridenEnterpriseModelForIntent(intent, currentModel, authStatus)
    }

    switch (intent) {
        case 'fix':
            // Fix is a case where we want to ensure that users do not end up with a broken edit model.
            // It is outside of the typical Edit flow so it is more likely a user could become "stuck" here.
            // TODO: Make the model usage more visible to users outside of the normal edit flow. This means
            // we could let the user provide any model they want for `fix`.
            // Issue: https://github.com/sourcegraph/cody/issues/3512
            return 'anthropic/claude-3-sonnet-20240229'
        case 'doc':
            // Doc is a case where we can sacrifice LLM performnace for improved latency and get comparable results.
            return 'anthropic/claude-3-haiku-20240307'
        case 'test':
        case 'add':
        case 'edit':
            // Support all model usage for add and edit intents.
            return currentModel
    }
}
