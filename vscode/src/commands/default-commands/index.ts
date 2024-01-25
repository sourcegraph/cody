import type { ChatEventSource, ContextFile } from '@sourcegraph/cody-shared'
import { explainCommand } from './explain'
import { smellCommand } from './smell'
import { testCommand } from './test'

import type { ChatSubmitType } from '../../chat/protocol'

// Default Cody Commands
export type DefaultCodyCommands = DefaultCodyChatCommands | DefaultCodyEditCommands
export type DefaultCodyChatCommands = 'test' | 'smell' | 'explain'
export type DefaultCodyEditCommands = 'doc' | 'edit'

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
 * Gets the default command prompt and context with arguments for the given default command.
 */
export async function getDefaultChatCommandParams(id: DefaultCodyCommands): Promise<ExecuteChat> {
    if (id === 'explain') {
        return await explainCommand()
    }

    if (id === 'smell') {
        return await smellCommand()
    }

    return await testCommand()
}
