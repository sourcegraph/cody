import * as vscode from 'vscode'

import { logDebug } from '@sourcegraph/cody-shared'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'

import { wrapInActiveSpan } from '@sourcegraph/cody-shared/src/tracing'
import { execQueryWrapper } from '../../tree-sitter/query-sdk'

/**
 * The command that generates a new docstring for the selected code.
 * When calls, the command will be executed as an inline-edit command.
 *
 * Context: add by the edit command
 */
export async function executeDocCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    return wrapInActiveSpan('command.doc', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeDocCommand', 'executing', { args })
        let prompt = defaultCommands.doc.prompt

        if (args?.additionalInstruction) {
            span.addEvent('additionalInstruction')
            prompt = `${prompt} ${args.additionalInstruction}`
        }

        const editor = getEditor()?.active
        const document = editor?.document

        if (!document) {
            return undefined
        }

        /**
         * Attempt to get the range of a documentable symbol at the current cursor position.
         * If present, use this for the edit instead of expanding the range to the nearest block.
         */
        let symbolRange: vscode.Range | undefined
        const [documentableNodeAtCursor] = execQueryWrapper(editor.document, editor.selection.active, 'getDocumentableNode')
        if (documentableNodeAtCursor) {
            const { node: { startPosition, endPosition } } = documentableNodeAtCursor
            symbolRange = new vscode.Range(startPosition.row, startPosition.column, endPosition.row, endPosition.column)
        }

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    instruction: prompt,
                    intent: 'doc',
                    mode: 'insert',
                    range: symbolRange
                },
                source: DefaultEditCommands.Doc,
            } satisfies ExecuteEditArguments),
        }
    })
}
