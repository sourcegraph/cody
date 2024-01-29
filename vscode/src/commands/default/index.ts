import {
    DefaultChatCommands,
    type DefaultCodyCommands,
    DefaultEditCommands,
} from '@sourcegraph/cody-shared/src/commands/types'
import { executeSmellCommand } from './smell'
import { executeExplainCommand } from './explain'
import { executeTestCommand } from './test'
import { executeDocCommand } from './doc'
import type { CommandResult } from '../../main'
import { executeUnitTestCommand } from './unit'

export { commands as defaultCommands } from './cody.json'

export { executeSmellCommand } from './smell'
export { executeExplainCommand } from './explain'
export { executeTestCommand } from './test'
export { executeDocCommand } from './doc'
export { executeUnitTestCommand } from './unit'

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
    id: DefaultCodyCommands | string
): Promise<CommandResult | undefined> {
    const key = id.replace(/^\//, '').trim() as DefaultCodyCommands
    switch (key) {
        case DefaultChatCommands.Explain:
            return executeExplainCommand()
        case DefaultChatCommands.Smell:
            return executeSmellCommand()
        case DefaultChatCommands.Test:
            return executeTestCommand()
        case DefaultEditCommands.Unit:
            return executeUnitTestCommand()
        case DefaultEditCommands.Doc:
            return executeDocCommand()
        default:
            console.log('not a default command')
            return undefined
    }
}
