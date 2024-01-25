import type { ContextFile } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { getContextFileFromCursor } from '../context/selection'
import { getContextFilesForTests } from '../context/test-files'
import type { ExecuteChatArguments } from '.'
import type { ChatSession } from '../../chat/chat-view/SimpleChatPanelProvider'
import { executeChat } from './ask'

/**
 * Generates the prompt and context files with arguments for the 'test' command.
 *
 * Context: Test files, current selection, and current file
 */
export async function testCommand(): Promise<{ prompt: string; args: ExecuteChatArguments }> {
    const prompt =
        "Review the shared code context and configurations to identify the test framework and libraries in use. Then, generate a suite of multiple unit tests for the functions in <selected> using the detected test framework and libraries. Be sure to import the function being tested. Follow the same patterns as any shared context. Only add packages, imports, dependencies, and assertions if they are used in the shared code. Pay attention to the file path of each shared context to see if test for <selected> already exists. If one exists, focus on generating new unit tests for uncovered cases. If none are detected, import common unit test libraries for this programming language. Focus on validating key functionality with simple and complete assertions. Only include mocks if one is detected in the shared code. Before writing the tests, identify which test libraries and frameworks to import, e.g. 'No new imports needed - using existing libs' or 'Importing test framework that matches shared context usage' or 'Importing the defined framework', etc. Then briefly summarize test coverage and any limitations. At the end, enclose the full completed code for the new unit tests, including all necessary imports, in a single markdown codeblock. No fragments or TODO. The new tests should validate expected functionality and cover edge cases for <selected> with all required imports, including importing the function being tested. Do not repeat existing tests."

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
        prompt,
        args: {
            userContextFiles: contextFiles,
            addEnhancedContext: false,
            source: 'test',
        },
    }
}

/**
 * Executes the text command as a chat command via 'cody.action.chat'
 */
export async function executeTestCommand(): Promise<ChatSession | undefined> {
    const { prompt, args } = await testCommand()
    return executeChat(prompt, args)
}
