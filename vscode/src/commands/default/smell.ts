import { logDebug, type ContextFile } from '@sourcegraph/cody-shared'
import { getContextFileFromCursor } from '../context/selection'
import { type ExecuteChatArguments, executeChat } from './ask'
import { DefaultChatCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
import type { ChatCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'

/**
 * Generates the prompt and context files with arguments for the 'smell' command.
 *
 * Context: Current selection
 */
export async function smellCommand(): Promise<ExecuteChatArguments> {
    const addEnhancedContext = false
    const prompt = defaultCommands.smell.prompt

    const contextFiles: ContextFile[] = []
    const currentSelection = await getContextFileFromCursor()
    contextFiles.push(...currentSelection)

    return {
        text: prompt,
        submitType: 'user-newchat',
        contextFiles,
        addEnhancedContext,
        source: DefaultChatCommands.Smell,
    }
}

/**
 * Executes the smell command as a chat command via 'cody.action.chat'
 */
export async function executeSmellCommand(
    args?: Partial<CodyCommandArgs>
): Promise<ChatCommandResult | undefined> {
    logDebug('executeDocCommand', 'executing', { args })
    return {
        type: 'chat',
        session: await executeChat(await smellCommand()),
    }
}
