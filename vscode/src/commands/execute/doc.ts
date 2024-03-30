import * as vscode from 'vscode'

import { logDebug } from '@sourcegraph/cody-shared'
import { DefaultEditCommands } from '@sourcegraph/cody-shared/src/commands/types'
import { defaultCommands } from '.'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { EditCommandResult } from '../../main'
import type { CodyCommandArgs } from '../types'

import { wrapInActiveSpan } from '@sourcegraph/cody-shared/src/tracing'
import { getEditLineSelection } from '../../edit/utils/edit-selection'
import { execQueryWrapper } from '../../tree-sitter/query-sdk'

/**
 * Gets the symbol range and preferred insertion point for documentation
 * at the given document position.
 *
 * Checks for a documentable node (e.g. function, class, variable etc.) at the position
 * using a tree-sitter query. If found, returns the range for the symbol
 * and an insertion point (typically the line above or below the symbol)
 * that follows language conventions for documentation.
 *
 * Handles some special cases like adjusting the insertion point for Python
 * functions/classes to comply with PEP 257.
 */
function getDocumentableRange(editor: vscode.TextEditor): {
    range?: vscode.Range
    insertionPoint?: vscode.Position
} {
    const { document, selection } = editor
    if (!selection.isEmpty) {
        const lineSelection = getEditLineSelection(editor.document, editor.selection)
        // The user has made an active selection, use that as the documentable range
        return {
            range: lineSelection,
            insertionPoint: lineSelection.start,
        }
    }

    /**
     * Attempt to get the range of a documentable symbol at the current cursor position.
     * If present, use this for the edit instead of expanding the range to the nearest block.
     */
    const [documentableNode] = execQueryWrapper({
        document,
        position: editor.selection.active,
        queryWrapper: 'getDocumentableNode',
    })
    if (!documentableNode) {
        return {}
    }

    const { range: documentableRange, insertionPoint: documentableInsertionPoint } = documentableNode
    if (!documentableRange) {
        // No user-provided selection, no documentable range found.
        // Fallback to expanding the range to the nearest block.
        return {}
    }

    const {
        node: { startPosition, endPosition },
    } = documentableRange

    const insertionPoint = documentableInsertionPoint
        ? new vscode.Position(documentableInsertionPoint.node.startPosition.row + 1, 0)
        : new vscode.Position(
              startPosition.row,
              document.lineAt(startPosition.row).firstNonWhitespaceCharacterIndex
          )

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
 * When called, the command will be executed as an inline-edit command.
 */
export async function executeDocCommand(
    args?: Partial<CodyCommandArgs>
): Promise<EditCommandResult | undefined> {
    // In the Agent, this is called when we receive a 'commands/document', with no args.
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

        const { range, insertionPoint } = getDocumentableRange(editor)

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
