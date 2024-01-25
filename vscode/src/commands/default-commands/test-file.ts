import type { ContextFile } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getContextFileFromCursor } from '../context/selection'
import { getContextFilesForTests } from '../context/test-files'

/**
 * The experimental command that generates a new test file for the selected code.
 * When calls, the command will be executed as an inline-edit command.
 *
 * Context: Test files, current selection, and current file
 */
// TODO (bee) replace old test command with this one
export async function executeNewTestCommand(): Promise<void> {
    const prompt =
        'Review the shared code context and configurations to identify the testing framework and libraries in use. Then, generate a suite of multiple unit tests for the functions in <selected> using the detected test framework and libraries. Be sure to import the function being tested. Follow the same patterns, testing conventions and testing library as shown in shared context. Only add packages, imports, dependencies, and assertions if they are used in the shared code. Pay attention to the file name of each shared context to see if test for <selected> already exists. If one exists, focus on generating new unit tests for uncovered cases. If none are detected, import common unit test libraries for {languageName}. Focus on validating key functionality with simple and complete assertions. Only include mocks if one is detected in the shared code. Before writing the tests, identify which testing libraries and frameworks to use and import. Then, enclose the file name for the unit test file between <FILEPATH7041> tags. At the end, enclose the full completed code for the new unit tests without any comments, fragments or TODO. The new tests should validate expected functionality and cover edge cases for <selected> with all required imports, including the function being tested. Do not repeat tests in shared context. Do not include any markdown formatting or triple backticks. Enclose only the complete runnable tests. If there is a shared context that has the same test file name, only include import if no conflict exists.'

    const editor = getEditor()?.active
    const document = editor?.document
    if (!document) {
        return
    }

    const contextFiles: ContextFile[] = []

    try {
        const cursorContext = await getContextFileFromCursor()
        if (cursorContext) {
            contextFiles.push(cursorContext)
        }
        const files = await getContextFilesForTests(document.uri)
        contextFiles.push(...files)
    } catch (error) {
        console.error(error)
    }

    await executeEdit(
        {
            instruction: prompt,
            document,
            intent: 'new',
            mode: 'file',
            userContextFiles: contextFiles,
        } satisfies ExecuteEditArguments,
        'doc'
    )
}
