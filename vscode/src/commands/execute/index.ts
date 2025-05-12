import {
    type ContextItem,
    DefaultChatCommands,
    type DefaultCodyCommands,
    DefaultEditCommands,
    PromptString,
    ps,
} from '@sourcegraph/cody-shared'
import type { CommandResult } from '../../CommandResult'
import { executeEdit } from '../../edit/execute'
import type { CodyCommandArgs } from '../types'
import { executeDocCommand } from './doc'
import { executeExplainCommand } from './explain'
import { executeSmellCommand } from './smell'
import { executeTestEditCommand } from './test-edit'

export { commands as defaultCommands } from './cody.json'

export { executeSmellCommand } from './smell'
export { executeExplainCommand } from './explain'
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
    args?: CodyCommandArgs
): Promise<CommandResult | undefined> {
    const key = id.replace(/^\//, '').trim() as DefaultCodyCommands
    switch (key) {
        case DefaultChatCommands.Explain:
            return executeExplainCommand(args)
        case DefaultChatCommands.Smell:
            return executeSmellCommand(args)
        case DefaultEditCommands.Test:
            return executeTestEditCommand(args)
        case DefaultEditCommands.Doc:
            return executeDocCommand(args)
        case DefaultEditCommands.Edit:
            return { task: await executeEdit(args || {}), type: 'edit' }
        default:
            console.log('not a default command')
            return undefined
    }
}

export function selectedCodePromptWithExtraFiles(
    primary: ContextItem,
    other: ContextItem[]
): PromptString {
    const primaryMention = ps`@${PromptString.fromDisplayPathLineRange(primary.uri, primary.range)}`
    const otherMentions = other.map(
        item => ps`@${PromptString.fromDisplayPathLineRange(item.uri, item.range)}`
    )
    return PromptString.join([primaryMention, ...otherMentions], ps` `)
}
