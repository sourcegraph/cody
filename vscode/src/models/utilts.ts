import { type AuthStatus, ModelProvider } from '@sourcegraph/cody-shared'
import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import * as vscode from 'vscode'

export function addEnterpriseChatModel(authStatus: AuthStatus): void {
    // In enterprise mode, we let the sg instance dictate the token limits and allow users to
    // overwrite it locally (for debugging purposes).
    //
    // This is similiar to the behavior we had before introducing the new chat and allows BYOK
    // customers to set a model of their choice without us having to map it to a known model on
    // the client.
    if (authStatus?.configOverwrites?.chatModel) {
        const codyConfig = vscode.workspace.getConfiguration('cody')
        const tokenLimitConfig = codyConfig.get<number>('provider.limit.prompt')
        const tokenLimit = tokenLimitConfig ?? authStatus.configOverwrites?.chatModelMaxTokens
        ModelProvider.add(
            new ModelProvider(
                authStatus.configOverwrites.chatModel,
                // TODO: Add configOverwrites.editModel for separate edit support
                [ModelUsage.Chat, ModelUsage.Edit],
                tokenLimit
            )
        )
    }
}
