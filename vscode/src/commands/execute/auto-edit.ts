import * as vscode from 'vscode'

import { logDebug, ps } from '@sourcegraph/cody-shared'
import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
import type { EditCommandResult } from '../../CommandResult'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { CodyCommandArgs } from '../types'

/**
 * Executes Edit command at current cursor position without manually-provided instruction.
 * It prompts the LLM to provide the completed code to insert at the current cursor position,
 * or if a selection is detected, edit the selected code instead.
 *
 * @param args - Optional arguments for the command, including the URI of the document to operate on and the selection range.
 * @returns The result of the edit command, or `undefined` if the command could not be executed.
 */
export async function executeAutoEditCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.fim', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeAutoEditCommand', 'executing', { verbose: args })

        const editor = args?.uri ? await vscode.window.showTextDocument(args.uri) : getEditor()?.active
        if (!editor?.document) {
            throw new Error('No active editor or document')
        }

        if (args?.range) {
            editor.selection = new vscode.Selection(args.range.start, args.range.end)
        }

        const isLineEmpty = editor.document.lineAt(editor.selection.start.line).isEmptyOrWhitespace
        const isSelectionEmpty = editor.selection.isEmpty && isLineEmpty

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    instruction: isSelectionEmpty ? fim : edit,
                    intent: isSelectionEmpty ? 'add' : 'edit',
                    mode: isSelectionEmpty ? 'insert' : 'edit',
                },
                source: args?.source,
            } satisfies ExecuteEditArguments),
        }
    })
}

// Prompt for fill-in code
const fim = ps`Based on the surrounding code and inline instructions (if any), generate the completed code that can be added to the current cursor position marked with <|cursor|>. If no updates are needed, add a comment for the code after the cursor instead. The response should only contain code that can be inserted at the current position WITHOUT including the code before and after the cursor. For example, when adding a docstring for a block of code, only include the docstring in the response.`

// Prompt for editing selected code
const edit = ps`Based on the surrounding code and inline instructions (if any), generate the completed code that can replace the current selection. Delete code that no longer applies. If no updates are needed, add comments for the code instead. The response should only contain code that can be inserted at the current position WITHOUT including the code before and after the cursor. For example, when adding a docstring, only include the docstring in the response.`
