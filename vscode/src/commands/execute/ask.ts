import {
    ConfigFeaturesSingleton,
    type DefaultChatCommands,
    type EventSource,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ChatSession } from '../../chat/chat-view/SimpleChatPanelProvider'
import type { WebviewSubmitMessage } from '../../chat/protocol'
import { getEditor } from '../../editor/active-editor'

export interface ExecuteChatArguments extends WebviewSubmitMessage {
    source?: EventSource
    command?: DefaultChatCommands
}

/**
 * Wrapper around the `cody.action.chat` command that can be used anywhere but with better type-safety.
 * This is also called by all the default chat commands (e.g. /explain, /smell).
 */
export const executeChat = async (args: ExecuteChatArguments): Promise<ChatSession | undefined> => {
    const { chat, commands } = await ConfigFeaturesSingleton.getInstance().getConfigFeatures()
    const isCommand = Boolean(args.command)
    if ((!isCommand && !chat) || (isCommand && !commands)) {
        void vscode.window.showErrorMessage(
            'This feature has been disabled by your Sourcegraph site admin.'
        )
        return undefined
    }

    if (isCommand && getEditor()?.ignored) {
        void vscode.window.showErrorMessage('Cannot execute a command in an ignored file.')
        return undefined
    }

    return vscode.commands.executeCommand<ChatSession | undefined>('cody.action.chat', args)
}
