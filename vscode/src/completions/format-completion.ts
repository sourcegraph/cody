import * as vscode from 'vscode'

import { getEditorInsertSpaces, getEditorTabSize } from '../utils'

import { AutocompleteItem } from './inline-completion-item-provider'
import { logCompletionFormatEvent, logError } from './logger'
import { lines } from './text-processing'

export async function formatCompletion(autocompleteItem: AutocompleteItem): Promise<void> {
    try {
        const startedAt = performance.now()
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
        // Start at the beginning of the line to format the whole line if needed.
        const rangeToFormat = new vscode.Range(new vscode.Position(position.line, 0), endPosition)

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
            await vscode.window.activeTextEditor?.edit(
                edit => {
                    for (const change of formattingChangesInRange) {
                        edit.replace(change.range, change.newText)
                    }
                },
                { undoStopBefore: false, undoStopAfter: true }
            )
        }

        logCompletionFormatEvent({
            duration: performance.now() - startedAt,
            languageId: document.languageId,
            formatter: getFormatter(document.languageId),
        })
    } catch (unknownError) {
        logError(unknownError instanceof Error ? unknownError : new Error(unknownError as string))
    }
}

function getFormatter(languageId: string): string | undefined {
    // Access the configuration for the specific languageId
    const config = vscode.workspace.getConfiguration(`[${languageId}]`)

    // Get the default formatter setting
    const defaultFormatter = config.get('editor.defaultFormatter')

    if (defaultFormatter) {
        return defaultFormatter as string
    }

    // Fallback: Check the global default formatter if specific language formatter is not set
    const globalConfig = vscode.workspace.getConfiguration()
    return globalConfig.get('editor.defaultFormatter')
}
