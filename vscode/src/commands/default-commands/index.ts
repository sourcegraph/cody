import type { ChatEventSource, ContextFile } from '@sourcegraph/cody-shared'
import { explainCommand } from './explain'
import { smellCommand } from './smell'
import { testCommand } from './test'

import * as vscode from 'vscode'
import type { ChatSubmitType } from '@sourcegraph/cody-ui/src/Chat'
import type { ChatSession } from '../../chat/chat-view/SimpleChatPanelProvider'

export type DefaultCodyCommands = 'test' | 'smell' | 'explain'

export interface ExecuteChat {
    prompt: string
    args?: ExecuteChatArguments
}

export interface ExecuteChatArguments {
    userContextFiles?: ContextFile[]
    addEnhancedContext?: boolean
    source?: ChatEventSource
    submitType?: ChatSubmitType
}

/**
 * Wrapper around the `chat` command that can be used anywhere but with better type-safety.
 */
export const executeChat = async (
    prompt: string,
    args?: ExecuteChatArguments
): Promise<ChatSession | undefined> => {
    return await vscode.commands.executeCommand('cody.action.chat', prompt, args)
}

/**
 * Gets the default command prompt and arguments for the given command ID.
 * @param id - The ID of the command to get the default for. One of 'test', 'smell', or 'explain'.
 * @returns A promise resolving to the default command prompt and arguments.
 */
export async function getDefaultCommandParams(id: DefaultCodyCommands): Promise<ExecuteChat> {
    if (id === 'explain') {
        return await explainCommand()
    }
    if (id === 'smell') {
        return await smellCommand()
    }

    return await testCommand()
}
