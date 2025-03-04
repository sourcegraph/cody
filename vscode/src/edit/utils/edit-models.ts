import { type AuthStatus, type EditModel, isDotCom } from '@sourcegraph/cody-shared'
import type { EditIntent } from '../types'

export function getOverriddenModelForIntent(
    intent: EditIntent,
    currentModel: EditModel,
    authStatus: AuthStatus
): EditModel {
    if (!isDotCom(authStatus)) {
        // We do not want to override the model if the user is connected to an enterprise instance.
        // We cannot assume what models will be available here.
        return currentModel
    }

    switch (intent) {
        case 'fix':
            // Fix is a case where we want to ensure that users do not end up with a broken edit model.
            // It is outside of the typical Edit flow so it is more likely a user could become "stuck" here.
            // TODO: Make the model usage more visible to users outside of the normal edit flow. This means
            // we could let the user provide any model they want for `fix`.
            // Issue: https://github.com/sourcegraph/cody/issues/3512
            return 'anthropic::2024-10-22::claude-3-5-sonnet-latest'
        case 'doc':
            // Doc is a case where we can sacrifice LLM performance for improved latency and get comparable results.
            return 'anthropic::2024-10-22::claude-3-5-haiku-latest'

        case 'test':
        case 'add':
        case 'edit':
        case 'smartApply':
            // Support all model usage for add and edit intents.
            return currentModel
    }
}
