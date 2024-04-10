import { type ContextItem, logError } from '@sourcegraph/cody-shared'
import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { URI } from 'vscode-uri'

import { defaultCommands } from '.'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditLineSelection } from '../../edit/utils/edit-selection'
import { getEditor } from '../../editor/active-editor'
import type { EditCommandResult } from '../../main'
import { execQueryWrapper } from '../../tree-sitter/query-sdk'
import { getContextFilesForUnitTestCommand } from '../context/unit-test-file'
import type { CodyCommandArgs } from '../types'
import { isTestFileForOriginal } from '../utils/test-commands'

/**
 * Gets the range to test.
 *
 * Checks for a testable node (e.g. function) at the position
 * using a tree-sitter query. If found, returns the range for the symbol.
 */
function getTestableRange(editor: vscode.TextEditor): vscode.Range | undefined {
    const { document, selection } = editor
    if (!selection.isEmpty) {
        const lineSelection = getEditLineSelection(editor.document, editor.selection)
        // The user has made an active selection, use that as the testable range
        return lineSelection
    }

    /**
     * Attempt to get the range of a testable symbol at the current cursor position.
     * If present, use this for the edit instead of expanding the range to the nearest block.
     */
    const [testableNode] = execQueryWrapper({
        document,
        position: editor.selection.active,
        queryWrapper: 'getTestableNode',
    })
    if (!testableNode) {
        return undefined
    }

    const { range: testableRange } = testableNode
    if (!testableRange) {
        // No user-provided selection, no testable range found.
        // Fallback to expanding the range to the nearest block.
        return undefined
    }

    const {
        node: { startPosition, endPosition },
    } = testableRange

    return new vscode.Range(startPosition.row, startPosition.column, endPosition.row, endPosition.column)
}

/**
 * Command that generates a new test file for the selected code with unit tests added.
 * When calls, the command will be executed as an inline-edit command.
 *
 * Context: Test files, current selection, and current file
 */
export async function executeTestEditCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.test', async span => {
        span.setAttribute('sampled', true)
        // The prompt for generating tests in a new test file
        const newTestFilePrompt = defaultCommands.test.prompt
        // The prompt for adding new test suite to an existing test file
        const newTestSuitePrompt =
            'Review the shared code context to identify the testing framework and libraries in use. Then, create a new test suite with multiple new unit tests for my selected code following the same patterns, testing framework, conventions, and libraries as shown in the shared context. Pay attention to the shared context to ensure that your response code does not contain cases that have already been covered. Focus on generating new unit tests for uncovered cases. Respond only with the fully completed code for the new tests without any added comments, fragments, or TODO. The new tests should validate the expected functionality and cover edge cases for the selected code. The goal is to provide me with a new test suite that I can add to the end of the existing test file. Enclose only the new test suite without any import statements or modules in your response. Do not repeat tests from the shared context.'

        const editor = getEditor()?.active
        const document = editor?.document
        if (!document) {
            return
        }

        // Selection will be added by the edit command
        // Only add context from available test files
        const contextFiles: ContextItem[] = []

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
                span.addEvent('hasExistingTestFile')
                destinationFile = testFile.uri
            }
        }

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    instruction: destinationFile?.path ? newTestSuitePrompt : newTestFilePrompt,
                    document,
                    range: getTestableRange(editor),
                    intent: 'test',
                    mode: 'insert',
                    // use 3 context files as sharing too many context could result in quality issue
                    userContextFiles: contextFiles.slice(0, 2),
                    destinationFile,
                },
                source: args?.source,
            } satisfies ExecuteEditArguments),
        }
    })
}
