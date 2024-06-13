import { getEditorInsertSpaces, getEditorTabSize } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { sleep } from '../completions/utils'
import { logDebug } from '../log'
import { isInTutorial } from '../tutorial/helpers'

/**
 * Maximum amount of time to spend formatting.
 * If the formatter takes longer than this then we will skip formatting completely.
 */
const FORMATTING_TIMEOUT = 1000

async function getFormattingChangesForRange(
    document: vscode.TextDocument,
    range: vscode.Range
): Promise<vscode.TextEdit[]> {
    const formattingChanges =
        (await Promise.race([
            vscode.commands.executeCommand<vscode.TextEdit[]>(
                'vscode.executeFormatDocumentProvider',
                document.uri,
                {
                    tabSize: getEditorTabSize(document.uri, vscode.workspace, vscode.window),
                    insertSpaces: getEditorInsertSpaces(document.uri, vscode.workspace, vscode.window),
                }
            ),
            sleep(FORMATTING_TIMEOUT),
        ])) || []

    return formattingChanges.filter(change => range.contains(change.range))
}

export async function getFormattedReplacement(
    document: vscode.TextDocument,
    currentText: string,
    rangeToFormat: vscode.Range,
    formatter = getFormattingChangesForRange // For testing
): Promise<string | undefined> {
    if (isInTutorial(document)) {
        // Skip formatting in tutorial files,
        // This is an additional enhancement that doesn't add much value to the tutorial
        // and makes the tutorial UX more error-prone
        return
    }

    // Expand the range to include full lines to reduce the likelihood of formatting issues
    const fullRangeToFormat = new vscode.Range(
        rangeToFormat.start.line,
        0,
        rangeToFormat.end.line,
        Number.MAX_VALUE
    )

    const formattingChangesInRange = await formatter(document, rangeToFormat)
    if (formattingChangesInRange.length === 0) {
        return
    }

    logDebug('FixupController:edit', 'formatting')

    let formattedReplacement = currentText
    let offsetAdjustment = 0
    const taskOffset = document.offsetAt(fullRangeToFormat.start)

    for (const change of formattingChangesInRange) {
        // Convert the range start and end positions to offsets relative to the selection range
        const startOffset = document.offsetAt(change.range.start) - taskOffset + offsetAdjustment
        const endOffset = document.offsetAt(change.range.end) - taskOffset + offsetAdjustment

        // Replace the text within the range with the new text
        formattedReplacement =
            formattedReplacement.substring(0, startOffset) +
            change.newText +
            formattedReplacement.substring(endOffset)

        // Adjust the offset for subsequent changes
        offsetAdjustment += change.newText.length - (endOffset - startOffset)
    }

    return formattedReplacement
}
