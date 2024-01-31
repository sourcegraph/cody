import { logError, type ContextFile } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'
import { getContextFilesForUnitTestCommand } from '../context/unit-test-file'

import type { URI } from 'vscode-uri'
import { isTestFileForOriginal } from '../utils/test-commands'
/**
 * Command that generates a new test file for the selected code with unit tests added.
 * When calls, the command will be executed as an inline-edit command.
 *
 * Context: Test files, current selection, and current file
 */
export async function executeTestCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    // The prompt for generating tests in a new test file
    const newTestFilePrompt = defaultCommands.test.prompt
    // The prompt for adding new test suite to an existing test file
    const newTestSuitePrompt =
        'Review the shared code context to identify the testing framework and libraries in use. Then, create multiple new unit tests for the functions in <selected> following the same patterns, testing conventions and testing library as shown in shared context. Pay attention to the shared context to ensure your response code do not contain cases that have already been covered. Focus on generating new unit tests for uncovered cases. Response only with the full completed code with the new unit tests added at the end, without any comments, fragments or TODO. The new tests should validate expected functionality and cover edge cases for <selected>. Do not include any markdown formatting or triple backticks. The goal is to provide me with code that I can add to the end of existing test file. Enclose only the new test suite WITHOUT ANY import statements or packages in your response.'

    const editor = getEditor()?.active
    const document = editor?.document
    if (!document) {
        return
    }

    // Selection will be added by the edit command
    // Only add context from available test files
    const contextFiles: ContextFile[] = []
    try {
        const files = await getContextFilesForUnitTestCommand(document.uri)
        contextFiles.push(...files)
    } catch (error) {
        logError('executeNewTestCommand', 'failed to fetch context', { verbose: error })
    }

    // Loop through current context to see if the file has an exisiting test file
    let destinationFile: URI | undefined
    for (const testFile of contextFiles) {
        if (!destinationFile?.path && isTestFileForOriginal(document.uri, testFile.uri)) {
            destinationFile = testFile.uri
        }
    }

    return {
        type: 'edit',
        task: await executeEdit(
            {
                instruction: destinationFile?.path ? newTestSuitPrompt : newTestFilePrompt,
                document,
                intent: 'new',
                mode: 'test',
                // use 3 context files as sharing too many context could result in quality issue
                userContextFiles: contextFiles.slice(0, 2),
                destinationFile,
            } satisfies ExecuteEditArguments,
            DefaultEditCommands.Doc
        ),
    }
}
