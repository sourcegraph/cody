import {
    DefaultChatCommands,
    type DefaultCodyCommands,
    DefaultEditCommands,
} from '@sourcegraph/cody-shared/src/commands/types'
import type { CommandResult } from '../../main'
import { executeDocCommand } from './doc'
import { executeExplainCommand } from './explain'
import { executeSmellCommand } from './smell'
import { executeTestChatCommand } from './test-chat'
import { executeTestEditCommand } from './test-edit'

export { commands as defaultCommands } from './cody.json'

export { executeSmellCommand } from './smell'
export { executeExplainCommand } from './explain'
export { executeTestChatCommand } from './test-chat'
export { executeDocCommand } from './doc'
export { executeTestEditCommand } from './test-edit'
export { executeTestCaseEditCommand } from './test-case'
export { executeExplainOutput } from './terminal'

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
 * Executes the default command based on the given arguments.
 * Handles mapping chat commands and edit commands to their respective handler functions.
 * Returns the command result if a matched command is found, otherwise returns undefined.
 */
export async function executeDefaultCommand(
    id: DefaultCodyCommands | string,
    additionalInstruction?: string
): Promise<CommandResult | undefined> {
    const key = id.replace(/^\//, '').trim() as DefaultCodyCommands
    switch (key) {
        case DefaultChatCommands.Explain:
            return executeExplainCommand({ additionalInstruction })
        case DefaultChatCommands.Smell:
            return executeSmellCommand({ additionalInstruction })
        case DefaultChatCommands.Unit:
            return executeTestChatCommand({ additionalInstruction })
        case DefaultEditCommands.Test:
            return executeTestEditCommand({ additionalInstruction })
        case DefaultEditCommands.Doc:
            return executeDocCommand({ additionalInstruction })
        default:
            console.log('not a default command')
            return undefined
    }
}
