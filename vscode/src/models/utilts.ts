import * as vscode from 'vscode'

import { type ChatModel, type EditModel, isDotCom } from '@sourcegraph/cody-shared'
import type { AuthStatus } from '../chat/protocol'

export function getContextWindowForModel(
    authStatus: AuthStatus,
    modelID: EditModel | ChatModel
): number {
    // In enterprise mode, we let the sg instance dictate the token limits and allow users to
    // overwrite it locally (for debugging purposes).
    //
    // This is similiar to the behavior we had before introducing the new chat and allows BYOK
    // customers to set a model of their choice without us having to map it to a known model on
    // the client.
    if (authStatus.endpoint && !isDotCom(authStatus.endpoint)) {
        const codyConfig = vscode.workspace.getConfiguration('cody')
        const tokenLimit = codyConfig.get<number>('provider.limit.prompt')
        if (tokenLimit) {
            return tokenLimit * 4 // bytes per token
        }

        if (authStatus.configOverwrites?.chatModelMaxTokens) {
            return authStatus.configOverwrites.chatModelMaxTokens * 4 // bytes per token
        }

        return 28000 // 7000 tokens * 4 bytes per token
    }

    if (modelID === 'openai/gpt-4-1106-preview') {
        return 28000 // 7000 tokens * 4 bytes per token
    }
    if (modelID === 'openai/gpt-3.5-turbo') {
        return 10000 // 4,096 tokens * < 4 bytes per token
    }
    if (modelID === 'fireworks/accounts/fireworks/models/mixtral-8x7b-instruct') {
        return 28000 // 7000 tokens * 4 bytes per token
    }
    return 28000 // assume default to Claude-2-like model
}
