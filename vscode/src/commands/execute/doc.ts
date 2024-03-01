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

function getSymbolRangeAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): { range?: vscode.Range; insertionPoint?: vscode.Position } {
    const [_, documentableRange] = execQueryWrapper(document, position, 'getDocumentableNode')
    if (!documentableRange.node) {
        return {}
    }

    const { node: { startPosition, endPosition }, name } = documentableRange

    let insertionPoint = new vscode.Position(startPosition.row, 0)

    if (document.languageId === 'python' && name && (name === 'range.function' || name === 'range.class')) {
        /**
         * Adjust the insertion point to be below the symbol position for functions and classes.
         * This aligns with Python conventions for writing documentation: https://peps.python.org/pep-0257/
         */
        insertionPoint = new vscode.Position(startPosition.row + 1, 0)
    } else {
        // Default insertion is at the start of the symbol line
        insertionPoint = new vscode.Position(startPosition.row, 0)
    }

    return {
        range: new vscode.Range(
            startPosition.row,
            startPosition.column,
            endPosition.row,
            endPosition.column
        ),
        insertionPoint,
    }
}

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
        const symbolRange = getSymbolRangeAtPosition(
            editor.document,
            editor.selection.active
        )

        const range = symbolRange?.range || editor.selection
        const insertionPoint = symbolRange?.insertionPoint

        return {
            type: 'edit',
            task: await executeEdit({
                configuration: {
                    instruction: prompt,
                    intent: 'doc',
                    mode: 'insert',
                    range,
                    insertionPoint,
                },
                source: DefaultEditCommands.Doc,
            } satisfies ExecuteEditArguments),
        }
    })
}
