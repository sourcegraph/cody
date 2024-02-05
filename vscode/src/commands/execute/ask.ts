import * as vscode from 'vscode'
import type { ChatSession } from '../../chat/chat-view/SimpleChatPanelProvider'
import type { WebviewSubmitMessage } from '../../chat/protocol'
import { ConfigFeaturesSingleton, type ChatEventSource } from '@sourcegraph/cody-shared'
import { isDefaultChatCommand } from '.'

export interface ExecuteChatArguments extends WebviewSubmitMessage {
    source?: ChatEventSource
}

/**
 * Wrapper around the `cody.action.chat` command that can be used anywhere but with better type-safety.
 */
export const executeChat = async (args: ExecuteChatArguments): Promise<ChatSession | undefined> => {
    const { chat, commands } = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()
    const isCommand = isDefaultChatCommand(args.source || '')
    if ((!isCommand && !chat) || (isCommand && !commands)) {
        void vscode.window.showErrorMessage(
            'This feature has been disabled by your Sourcegraph site admin.'
        )
        return undefined
    }

    return vscode.commands.executeCommand<ChatSession | undefined>('cody.action.chat', args)
}
