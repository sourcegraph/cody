import { type AuthStatus, ModelProvider, isDotCom } from '@sourcegraph/cody-shared'
import { DEFAULT_DOT_COM_MODELS } from '@sourcegraph/cody-shared/src/models/dotcom'
import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import * as vscode from 'vscode'

/**
 * Sets the model providers based on the authentication status.
 *
 * If a chat model is configured to overwrite, it will add a model provider for that model.
 * The token limit for the provider will use the configured limit,
 * or fallback to the limit from the authentication status if not configured.
 */
export function setModelProviders(authStatus: AuthStatus): void {
    if (authStatus.endpoint && isDotCom(authStatus.endpoint)) {
        ModelProvider.setProviders(DEFAULT_DOT_COM_MODELS)
    }
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
        ModelProvider.setProviders([
            new ModelProvider(
                authStatus.configOverwrites.chatModel,
                // TODO: Add configOverwrites.editModel for separate edit support
                [ModelUsage.Chat, ModelUsage.Edit],
                tokenLimit
            ),
        ])
        return
    }
}
