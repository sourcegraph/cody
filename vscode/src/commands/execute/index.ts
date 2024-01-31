import {
    DefaultChatCommands,
    type DefaultCodyCommands,
    DefaultEditCommands,
} from '@sourcegraph/cody-shared/src/commands/types'
import { executeSmellCommand } from './smell'
import { executeExplainCommand } from './explain'
import { executeUnitTestCommand } from './unit'
import { executeDocCommand } from './doc'
import type { CommandResult } from '../../main'
import { executeTestCommand } from './test-file'

export { commands as defaultCommands } from './cody.json'

export { executeSmellCommand } from './smell'
export { executeExplainCommand } from './explain'
export { executeUnitTestCommand } from './unit'
export { executeDocCommand } from './doc'
export { executeTestCommand } from './test-file'
export { executeTestCaseCommand } from './test-case'

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
            return executeUnitTestCommand({ additionalInstruction })
        case DefaultEditCommands.Test:
            return executeTestCommand({ additionalInstruction })
        case DefaultEditCommands.Doc:
            return executeDocCommand({ additionalInstruction })
        default:
            console.log('not a default command')
            return undefined
    }
}
