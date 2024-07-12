import * as vscode from 'vscode'

import { PromptString, logDebug, ps } from '@sourcegraph/cody-shared'
import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
import { defaultCommands } from '.'
import type { EditCommandResult } from '../../CommandResult'
import { type ExecuteEditArguments, executeEdit } from '../../edit/execute'
import { getEditor } from '../../editor/active-editor'
import type { CodyCommandArgs } from '../types'

import {
    getEditAdjustedUserSelection,
    getEditDefaultProvidedRange,
    getEditLineSelection,
    getEditSmartSelection,
} from '../../edit/utils/edit-selection'
import { execQueryWrapper } from '../../tree-sitter/query-sdk'

/**
 * Gets the default range and insertion point for documenting the code around the current cursor position.
 */
async function getDefaultDocumentableRanges(editor: vscode.TextEditor): Promise<{
    range?: vscode.Range
    insertionPoint?: vscode.Position
}> {
    const defaultRange = getEditDefaultProvidedRange(editor.document, editor.selection)
    if (defaultRange) {
        return {
            range: defaultRange,
            insertionPoint: defaultRange.start,
        }
    }

    const smartSelection = await getEditSmartSelection(editor.document, editor.selection, {}, 'doc')
    if (!smartSelection.isEmpty) {
        return {
            range: smartSelection,
            insertionPoint: smartSelection.start,
        }
    }

    const lineSelection = getEditLineSelection(editor.document, editor.selection, { forceExpand: true })
    return {
        range: lineSelection,
        insertionPoint: lineSelection.start,
    }
}

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
async function getDocumentableRange(editor: vscode.TextEditor): Promise<{
    range?: vscode.Range
    insertionPoint?: vscode.Position
}> {
    const { document } = editor
    const adjustedSelection = getEditAdjustedUserSelection(document, editor.selection)

    /**
     * Attempt to get the range of a documentable symbol at the current cursor position.
     * If present, use this for the edit instead of expanding the range to the nearest block.
     */
    const [documentableNode] = execQueryWrapper({
        document,
        position: adjustedSelection.start,
        queryWrapper: 'getDocumentableNode',
    })

    if (!documentableNode) {
        return getDefaultDocumentableRanges(editor)
    }

    const { range: documentableRange, insertionPoint: documentableInsertionPoint } = documentableNode
    if (!documentableRange) {
        // No documentable range found.
        // Fallback to expanding the range to the nearest block.
        return getDefaultDocumentableRanges(editor)
    }

    const {
        node: { startPosition, endPosition },
    } = documentableRange
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
        // We found a documentable range, but the users' adjusted selection does not match it.
        // We have to use the users' selection here, as it's possible they do not want the documentable node.
        return getDefaultDocumentableRanges(editor)
    }

    const insertionPoint = documentableInsertionPoint
        ? new vscode.Position(documentableInsertionPoint.node.startPosition.row + 1, 0)
        : new vscode.Position(
              startPosition.row,
              document.lineAt(startPosition.row).firstNonWhitespaceCharacterIndex
          )

    return {
        range,
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
    return wrapInActiveSpan('command.doc', async span => {
        span.setAttribute('sampled', true)
        logDebug('executeDocCommand', 'executing', { verbose: args })

        let prompt = PromptString.fromDefaultCommands(defaultCommands, 'doc')
        if (args?.additionalInstruction) {
            span.addEvent('additionalInstruction')
            prompt = ps`${prompt} ${args.additionalInstruction}`
        }

        const editor = args?.uri ? await vscode.window.showTextDocument(args.uri) : getEditor()?.active
        const document = editor?.document

        if (!document) {
            return undefined
        }

        if (args?.range) {
            editor.selection = new vscode.Selection(args.range.start, args.range.end)
        }

        const { range, insertionPoint } = await getDocumentableRange(editor)

        const selectionText = document?.getText(range)
        if (!selectionText?.trim()) {
            throw new Error('Cannot document an empty selection.')
        }

        logDebug(
            'executeDocCommand',
            `selectionText: ${
                selectionText
                    ? selectionText.slice(0, 70) + (selectionText.length > 70 ? '...' : '')
                    : 'null'
            }`
        )

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
                source: args?.source,
            } satisfies ExecuteEditArguments),
        }
    })
}
