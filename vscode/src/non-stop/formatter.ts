import { getEditorInsertSpaces, getEditorTabSize } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { sleep } from '../completions/utils'
import { logDebug } from '../log'
import { isInTutorial } from '../tutorial/helpers'

/**
 * Maximum amount of time to spend formatting.
 * If the formatter takes longer than this then we will skip formatting completely.
 */
const FORMATTING_TIMEOUT = 5000 // TOOD: set to 1000

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

    // if (currentText.length) {
    //     // Disable formattign for now
    //     return
    // }

    // Expand the range to include full lines to reduce the likelihood of formatting issues
    const fullRangeToFormat = new vscode.Range(
        rangeToFormat.start.line,
        0,
        rangeToFormat.end.line,
        Number.MAX_VALUE
    )

    const formattingChangesInRange = await formatter(document, rangeToFormat)
    console.log('Formatting changes', formattingChangesInRange)
    if (formattingChangesInRange.length === 0) {
        return
    }

    logDebug('FixupController:edit', 'formatting')

    let formattedReplacement = currentText
    let offsetAdjustment = 0

    // Apply each formatting change to the original text
    for (const change of formattingChangesInRange) {
        // Convert the range start and end positions to offsets relative to the selection range
        const startOffset =
            document.offsetAt(change.range.start) -
            document.offsetAt(fullRangeToFormat.start) +
            offsetAdjustment
        const endOffset =
            document.offsetAt(change.range.end) -
            document.offsetAt(fullRangeToFormat.start) +
            offsetAdjustment

        const prefix = formattedReplacement.substring(0, startOffset)
        const suffix = formattedReplacement.substring(endOffset)

        // Replace the text within the range with the new text
        formattedReplacement = prefix + change.newText + suffix

        console.log('\nCurrent replacement:\n', formattedReplacement)
        // Adjust the offset for subsequent changes
        offsetAdjustment += change.newText.length - (endOffset - startOffset)
    }

    console.log('\nFinal formatted replacement:\n', formattedReplacement)
    return formattedReplacement
}
