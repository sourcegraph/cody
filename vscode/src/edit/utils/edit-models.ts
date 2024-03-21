import { type AuthStatus, ModelProvider } from '@sourcegraph/cody-shared'
import { type EditModel, ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import { setModelProviders } from '../../models/utilts'
import type { EditIntent } from '../types'

export function getEditModelsForUser(authStatus: AuthStatus): ModelProvider[] {
    setModelProviders(authStatus)
    return ModelProvider.get(ModelUsage.Edit, authStatus.endpoint)
}

export function getOverridenModelForIntent(intent: EditIntent, currentModel: EditModel): EditModel {
    switch (intent) {
        case 'fix':
            // Edit commands have only been tested with Claude 2. Default to that for now.
            return 'anthropic/claude-2.0'
        case 'doc':
            return 'anthropic/claude-instant-1.2'
        case 'test':
        case 'add':
        case 'edit':
            // Support all model usage for add and edit intents.
            return currentModel
    }
}
