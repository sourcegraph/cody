import { logError, type ContextFile, logDebug } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { getContextFileFromCursor } from '../context/selection'
import type { CodyCommandArgs } from '../types'
import { type ExecuteChatArguments, executeChat } from './ask'
import { defaultCommands } from '.'
import type { ChatCommandResult } from '../../main'
import { getContextFilesForTestCommand } from '../context/test-command'
/**
 * Generates the prompt and context files with arguments for the 'test' command.
 *
 * Context: Test files, current selection, and current file
 */
async function testCommand(): Promise<ExecuteChatArguments> {
    const prompt = defaultCommands.test.prompt

    const editor = getEditor()?.active
    const document = editor?.document
    const contextFiles: ContextFile[] = []

    if (document) {
        try {
            const cursorContext = await getContextFileFromCursor()
            contextFiles.push(...cursorContext)

            contextFiles.push(...(await getContextFilesForTestCommand(document.uri)))
        } catch (error) {
            logError('testCommand', 'failed to fetch context', { verbose: error })
        }
    }

    return {
        text: prompt,
        contextFiles,
        addEnhancedContext: false,
        source: 'test',
        submitType: 'user-newchat',
    }
}

/**
 * Executes the text command as a chat command via 'cody.action.chat'
 */
export async function executeTestCommand(
    args?: Partial<CodyCommandArgs>
): Promise<ChatCommandResult | undefined> {
    logDebug('executeTestCommand', 'executing', { args })
    return {
        type: 'chat',
        session: await executeChat(await testCommand()),
    }
}
