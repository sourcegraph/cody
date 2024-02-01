import { ModelProvider } from '@sourcegraph/cody-shared'
import type { AuthProvider } from '../../services/AuthProvider'
import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'

export function getEditModelsForUser(authProvider: AuthProvider): ModelProvider[] {
    const authStatus = authProvider.getAuthStatus()
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
