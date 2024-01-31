import { Range } from 'vscode'
import { logError, type ContextFile } from '@sourcegraph/cody-shared'
import { getEditor } from '../../editor/active-editor'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'
import { getContextFilesForAddingUnitTestCases } from '../context/unit-test-case'

/**
 * NOTE: Used by CommandCodeLenses in test files with 'cody.command.unit-tests-cases'.
 *
 * It generates new test cases for the selected test suit.
 * When invoked, the command will be executed as an inline-edit command.
 */
export async function executeTestCaseCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    const instruction =
        'Review the shared code context to identify the testing framework and libraries in use. Then, create multiple new unit tests for the functions in <selected> following the same patterns, testing conventions and testing library as shown in shared context. Pay attention to the shared context to ensure your response code do not contain cases that have already been covered. Focus on generating new unit tests for uncovered cases. Response only with the full completed code with the new unit tests added at the end, without any comments, fragments or TODO. The new tests should validate expected functionality and cover edge cases for <selected>. Do not include any markdown formatting or triple backticks. The goal is to provide me with code that I can add to the end of existing test file. Enclose only the new tests WITHOUT ANY suit, import statements or packages in your response.'

    const editor = getEditor()?.active
    const document = editor?.document
    // Current selection is required
    if (!document || !editor.selection) {
        return
    }

    const contextFiles: ContextFile[] = []
    try {
        const files = await getContextFilesForAddingUnitTestCases(document.uri)
        contextFiles.push(...files)
    } catch (error) {
        logError('executeNewTestCommand', 'failed to fetch context', { verbose: error })
    }

    const startLine = editor.selection.start.line + 1
    const endLine = Math.max(startLine, editor.selection.end.line)
    const range = new Range(startLine, 0, endLine, 0)

    return {
        type: 'edit',
        task: await executeEdit(
            {
                instruction,
                document,
                range,
                intent: 'edit',
                mode: 'insert',
                userContextFiles: contextFiles,
            } satisfies ExecuteEditArguments,
            DefaultEditCommands.Test
        ),
    }
}
