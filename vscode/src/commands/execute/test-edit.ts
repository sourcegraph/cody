import { type ContextItem, PromptString, logDebug, logError, ps } from '@sourcegraph/cody-shared'
import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { defaultCommands } from '.'
import type { EditCommandResult } from '../../CommandResult'
import { isUriIgnoredByContextFilterWithNotification } from '../../cody-ignore/context-filter'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import {
    getEditAdjustedUserSelection,
    getEditDefaultProvidedRange,
} from '../../edit/utils/edit-selection'
import { getEditor } from '../../editor/active-editor'
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
    const { document } = editor
    const adjustedSelection = getEditAdjustedUserSelection(document, editor.selection)

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
        return getEditDefaultProvidedRange(editor.document, editor.selection)
    }

    const { range: testableRange } = testableNode
    if (!testableRange) {
        // No user-provided selection, no testable range found.
        // Fallback to expanding the range to the nearest block,
        // as is the default behavior for all "Edit" commands
        return getEditDefaultProvidedRange(editor.document, editor.selection)
    }

    const {
        node: { startPosition, endPosition },
    } = testableRange
    const range = new vscode.Range(
        startPosition.row,
        startPosition.column,
        endPosition.row,
        endPosition.column
    )

    // If the users' adjusted selection aligns with the start of the node and is contained within the node,
    // It is probable that the user would benefit from expanding to this node completely
    const selectionMatchesNode =
        adjustedSelection.start.isEqual(range.start) && range.contains(adjustedSelection.end)
    if (!selectionMatchesNode && !editor.selection.isEmpty) {
        // We found a testable range, but the users' adjusted selection does not match it.
        // We have to use the users' selection here, as it's possible they do not want the testable node.
        return getEditDefaultProvidedRange(editor.document, editor.selection)
    }

    return range
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
        logDebug('executeTestEditCommand', 'executing', { verbose: args })

        // The prompt for generating tests in a new test file
        const newTestFilePrompt = PromptString.fromDefaultCommands(defaultCommands, 'test')
        // The prompt for adding new test suite to an existing test file
        const newTestSuitePrompt = ps`Review the shared code context to identify the testing framework and libraries in use. Then, create a new test suite with multiple new unit tests for my selected code following the same patterns, testing framework, conventions, and libraries as shown in the shared context. Pay attention to the shared context to ensure that your response code does not contain cases that have already been covered. Focus on generating new unit tests for uncovered cases. Respond only with the fully completed code for the new tests without any added comments, fragments, or TODO. The new tests should validate the expected functionality and cover edge cases for the selected code. The goal is to provide me with a new test suite that I can add to the end of the existing test file. Enclose only the new test suite without any import statements or modules in your response. Do not repeat tests from the shared context.`

        const editor = getEditor()?.active
        const document = editor?.document
        const uri = document?.uri

        if (!document || !uri || (await isUriIgnoredByContextFilterWithNotification(uri, 'test'))) {
            return
        }

        const range = getTestableRange(editor)

        const selectionText = document?.getText(range)

        if (!selectionText?.trim()) {
            throw new Error('Cannot generate unit test on empty selection.')
        }

        // Selection will be added by the edit command
        // Only add context from available test files
        const contextFiles: ContextItem[] = await getContextFilesForUnitTestCommand(uri).catch(error => {
            logError('executeNewTestCommand', 'failed to fetch context', { verbose: error })
            return []
        })

        // Loop through current context to see if the file has an exisiting test file
        const destinationFile = contextFiles.find(testFile =>
            isTestFileForOriginal(uri, testFile.uri)
        )?.uri

        if (destinationFile) {
            span.addEvent('hasExistingTestFile')
        }

        // The prompt to use depends on whether the file has an existing test file.
        const prompt = destinationFile?.path ? newTestSuitePrompt : newTestFilePrompt

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    instruction: prompt.replaceAll(
                        '{languageName}',
                        PromptString.fromMarkdownCodeBlockLanguageIDForFilename(uri)
                    ),
                    document,
                    range,
                    intent: 'test',
                    mode: 'insert',
                    // Limit to 3 context as too many context could result in quality issue.
                    userContextFiles: contextFiles.slice(0, 2),
                    destinationFile,
                },
                source: args?.source,
            } satisfies ExecuteEditArguments),
        }
    })
}
