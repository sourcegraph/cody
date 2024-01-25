import * as vscode from 'vscode'
import type { ChatSession } from '../../chat/chat-view/SimpleChatPanelProvider'
import type { ExecuteChatArguments } from '.'

/**
 * Wrapper around the `cody.action.chat` command that can be used anywhere but with better type-safety.
 */
export const executeChat = async (
    prompt: string,
    args?: ExecuteChatArguments
): Promise<ChatSession | undefined> => {
    return vscode.commands.executeCommand<ChatSession | undefined>('cody.action.chat', prompt, args)
}
