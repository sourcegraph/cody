import type * as vscode from 'vscode'
import type { EditIntent } from '../types'
import { DEFAULT_EDIT_INTENT } from '../constants'

/**
 * Checks if the current selection and editor represent a generate intent.
 * A generate intent means the user has an empty selection on an empty line.
 */
export function isGenerateIntent(
    document: vscode.TextDocument,
    selection: vscode.Selection | vscode.Range
): boolean {
    return selection.isEmpty && document.lineAt(selection.start.line).isEmptyOrWhitespace
}

export function getEditIntent(
    document: vscode.TextDocument,
    selection: vscode.Selection | vscode.Range,
    proposedIntent?: EditIntent
): EditIntent {
    console.log('Getting intent...')
    if (proposedIntent !== undefined && proposedIntent !== 'add') {
        // Return provided intent that should not be overriden
        return proposedIntent
    }

    if (isGenerateIntent(document, selection)) {
        return 'add'
    }

    return proposedIntent || DEFAULT_EDIT_INTENT
}
