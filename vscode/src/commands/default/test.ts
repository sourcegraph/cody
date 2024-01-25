import type { ContextFile } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { getContextFileFromCursor } from '../context/selection'
import { getContextFilesForTests } from '../context/test-files'

import type { ChatSession } from '../../chat/chat-view/SimpleChatPanelProvider'
import { type ExecuteChatArguments, executeChat } from './ask'
import { defaultCommands } from '.'
/**
 * Generates the prompt and context files with arguments for the 'test' command.
 *
 * Context: Test files, current selection, and current file
 */
export async function testCommand(): Promise<ExecuteChatArguments> {
    const prompt = defaultCommands.test.prompt

    const editor = getEditor()?.active
    const document = editor?.document
    const contextFiles: ContextFile[] = []

    if (document) {
        try {
            const cursorContext = await getContextFileFromCursor()
            if (cursorContext) {
                contextFiles.push(cursorContext)
            }

            contextFiles.push(...(await getContextFilesForTests(document.uri)))
        } catch (error) {
            console.error(error)
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
export async function executeTestCommand(): Promise<ChatSession | undefined> {
    return executeChat(await testCommand())
}
