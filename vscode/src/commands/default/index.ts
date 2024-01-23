import type { ChatEventSource, ContextFile } from '@sourcegraph/cody-shared'
import { explainCommand } from './explain'
import { smellCommand } from './smell'
import { testCommand } from './test'

import * as vscode from 'vscode'

export interface ExecuteChat {
    prompt: string
    args: ExecuteChatArguments
}

export interface ExecuteChatArguments {
    userContextFiles?: ContextFile[]
    addEnhancedContext?: boolean
    source?: ChatEventSource
}

/**
 * Wrapper around the `chat` command that can be used anywhere but with better type-safety.
 */
export const executeChat = async (prompt: string, args?: ExecuteChatArguments): Promise<void> => {
    return vscode.commands.executeCommand('cody.action.chat', prompt, args)
}

/**
 * Gets the default command prompt and arguments for the given command ID.
 * @param id - The ID of the command to get the default for. One of 'test', 'smell', or 'explain'.
 * @returns A promise resolving to the default command prompt and arguments.
 */
export async function getDefaultCommand(
    id: 'test' | 'smell' | 'explain'
): Promise<{ prompt: string; args?: ExecuteChatArguments }> {
    if (id === 'explain') {
        return await explainCommand()
    }
    if (id === 'smell') {
        return await smellCommand()
    }
    return await testCommand()
}
