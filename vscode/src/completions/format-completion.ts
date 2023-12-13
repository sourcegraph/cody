import * as vscode from 'vscode'

import { logError } from '../log'
import { getEditorInsertSpaces, getEditorTabSize } from '../utils'

import { AutocompleteItem } from './inline-completion-item-provider'
import { lines } from './text-processing'

export async function formatCompletion(autocompleteItem: AutocompleteItem): Promise<void> {
    try {
        const {
            document,
            position,
            docContext: { currentLinePrefix },
        } = autocompleteItem.requestParams

        const insertedLines = lines(autocompleteItem.analyticsItem.insertText)
        const endPosition =
            insertedLines.length <= 1
                ? new vscode.Position(position.line, currentLinePrefix.length + insertedLines[0].length)
                : new vscode.Position(position.line + insertedLines.length - 1, insertedLines.at(-1)!.length)
        const rangeToFormat = new vscode.Range(position, endPosition)

        const formattingChanges = await vscode.commands.executeCommand<vscode.TextEdit[] | undefined>(
            'vscode.executeFormatRangeProvider',
            document.uri,
            rangeToFormat,
            {
                tabSize: getEditorTabSize(document.uri),
                insertSpaces: getEditorInsertSpaces(document.uri),
            }
        )

        const formattingChangesInRange = (formattingChanges || []).filter(change =>
            rangeToFormat.contains(change.range)
        )

        if (formattingChangesInRange.length !== 0) {
            const edit = new vscode.WorkspaceEdit()
            for (const change of formattingChangesInRange) {
                edit.replace(document.uri, change.range, change.newText)
            }
            void vscode.workspace.applyEdit(edit)
        }
    } catch (unknownError) {
        const error = unknownError instanceof Error ? unknownError : new Error(unknownError as string)
        logError('InlineCompletionItemProvider:formatCompletion:error', error.message, error.stack, {
            verbose: { error },
        })
    }
}
