import * as vscode from 'vscode'
import type { ChatSession } from '../../chat/chat-view/SimpleChatPanelProvider'
import type { WebviewSubmitMessage } from '../../chat/protocol'
import type { ChatEventSource } from '@sourcegraph/cody-shared'

export interface ExecuteChatArguments extends WebviewSubmitMessage {
    source?: ChatEventSource
}

/**
 * Wrapper around the `cody.action.chat` command that can be used anywhere but with better type-safety.
 */
export const executeChat = async (args: ExecuteChatArguments): Promise<ChatSession | undefined> => {
    return vscode.commands.executeCommand<ChatSession | undefined>('cody.action.chat', args)
}
