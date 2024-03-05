import { type ContextItem, logError } from '@sourcegraph/cody-shared'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { Range } from 'vscode'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { EditCommandResult } from '../../main'
import { getContextFilesForAddingUnitTestCases } from '../context/unit-test-case'
import type { CodyCommandArgs } from '../types'

import { wrapInActiveSpan } from '@sourcegraph/cody-shared/src/tracing'

/**
 * Adds generated test cases to the selected test suite inline.
 *
 * NOTE: Used by Code Lenses in test files with 'cody.command.tests-cases'.
 */
export async function executeTestCaseEditCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.test-case', async span => {
        span.setAttribute('sampled', true)
        const instruction =
            'Review the shared code context to identify the testing framework and libraries in use. Then, create multiple new unit tests for the test suite in my selected code following the same patterns, testing conventions, and testing library as shown in the shared context. Pay attention to the shared context to ensure that your response code does not contain cases that have already been covered. Focus on generating new unit tests for uncovered cases. Respond only with the fully completed code with the new unit tests added at the end, without any comments, fragments, or TODO. The new tests should validate expected functionality and cover edge cases for the test suites. The goal is to provide me with code that I can add to the end of the existing test file. Do not repeat tests from the shared context. Enclose only the new tests without describe/suite, import statements, or packages in your response.'

        const editor = getEditor()?.active
        const document = editor?.document
        // Current selection is required
        if (!document || !editor.selection) {
            return
        }

        const contextFiles: ContextItem[] = []

        try {
            const files = await getContextFilesForAddingUnitTestCases(document.uri)
            contextFiles.push(...files)
        } catch (error) {
            logError('executeNewTestCommand', 'failed to fetch context', { verbose: error })
        }

        const startLine = editor.selection.start.line + 1
        const endLine = Math.max(startLine, editor.selection.end.line - 1)
        const range = new Range(startLine, 0, endLine, 0)

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    instruction,
                    document,
                    range,
                    intent: 'edit',
                    mode: 'insert',
                    userContextFiles: contextFiles,
                    destinationFile: document.uri,
                },
                source: DefaultEditCommands.Test,
            } satisfies ExecuteEditArguments),
        }
    })
}
