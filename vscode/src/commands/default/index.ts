import { explainCommand } from './explain'
import { smellCommand } from './smell'
import { testCommand } from './test'
import type { ExecuteChatArguments } from './ask'
import { DefaultChatCommands, DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'

export { commands as defaultCommands } from './cody.json'

export function isDefaultChatCommand(id: string): DefaultChatCommands | undefined {
    // Remove leading slash if any
    const key = id.replace(/^\//, '').trim() as DefaultChatCommands
    if (Object.values(DefaultChatCommands).includes(key)) {
        return key
    }
    return undefined
}

export function isDefaultEditCommand(id: string): DefaultEditCommands | undefined {
    // Remove leading slash if any
    const key = id.replace(/^\//, '').trim() as DefaultEditCommands
    if (Object.values(DefaultEditCommands).includes(key)) {
        return key
    }
    return undefined
}

/**
 * Gets the default command prompt and context with arguments for the given default command.
 */
export async function getDefaultChatCommandPrompts(
    id: DefaultChatCommands
): Promise<ExecuteChatArguments | undefined> {
    switch (id) {
        case DefaultChatCommands.Explain:
            return await explainCommand()
        case DefaultChatCommands.Smell:
            return await smellCommand()
        case DefaultChatCommands.Test:
            return await testCommand()
        default:
            return undefined
    }
}
