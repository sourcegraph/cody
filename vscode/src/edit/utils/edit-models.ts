import { ModelProvider } from '@sourcegraph/cody-shared'
import { type EditModel, ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import type { AuthStatus } from '../../chat/protocol'
import type { EditIntent } from '../types'

export function getEditModelsForUser(authStatus: AuthStatus): ModelProvider[] {
    if (authStatus?.configOverwrites?.chatModel) {
        ModelProvider.add(
            new ModelProvider(authStatus.configOverwrites.chatModel, [
                ModelUsage.Chat,
                // TODO: Add configOverwrites.editModel for separate edit support
                ModelUsage.Edit,
            ])
        )
    }
    return ModelProvider.get(ModelUsage.Edit, authStatus.endpoint)
}

export function getOverridenModelForIntent(intent: EditIntent, currentModel: EditModel): EditModel {
    switch (intent) {
        case 'doc':
        case 'fix':
        case 'test':
            // Edit commands have only been tested with Claude 2. Default to that for now.
            return 'anthropic/claude-2.0'
        case 'add':
        case 'edit':
            // Support all model usage for add and edit intents.
            return currentModel
    }
}
