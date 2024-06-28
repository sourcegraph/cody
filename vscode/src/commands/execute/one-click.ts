import * as vscode from 'vscode'

import { logDebug, ps } from '@sourcegraph/cody-shared'
import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
import type { EditCommandResult } from '../../CommandResult'
import { executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { CodyCommandArgs } from '../types'

/**
 * Executes an edit command on one-click.
 * It prompts the LLM to provide the completed code to insert at the current cursor position.
 *
 * @param args - Optional arguments for the command, including the URI of the document to operate on and the selection range.
 * @returns The result of the edit command, or `undefined` if the command could not be executed.
 */
export async function executeOneClickEditCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.fim', async span => {
        span.setAttribute('sampled', true)

        logDebug('executeOneClickEditCommand', 'executing', { verbose: args })

        const editor = args?.uri ? await vscode.window.showTextDocument(args.uri) : getEditor()?.active
        if (!editor?.document) {
            throw new Error('No active editor or document')
        }

        if (args?.range) {
            editor.selection = new vscode.Selection(args.range.start, args.range.end)
        }

        const isEmptySelection = editor.selection.isEmpty

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    instruction: isEmptySelection ? fim : edit,
                    intent: isEmptySelection ? 'add' : 'edit',
                    mode: 'insert',
                },
                source: args?.source,
            }),
        }
    })
}

// Prompt for fill-in code
const fim = ps`Based on the surrounding code and inline instructions (if any), generate the completed code that I can add to my current position marked with <|cursor|>. If you don't see anything that needs updating, add a comment for the code after the cursor instead. Your response should only contains code I can insert at my current position WITHOUT the code before and after the cursor. For example, if you are adding a docstring for a block of code, only include the docstring in your response.`

// Prompt for edit selected code
const edit = ps`Based on the surrounding code and inline instructions (if any), generate the completed code that I can replace my current selection with. Delete code that no longer applies. If you don't see anything that needs updating, add comments for the code instead. Your response should only contains code I can insert at my current position WITHOUT the code before and after the cursor. For example, if you are adding`
