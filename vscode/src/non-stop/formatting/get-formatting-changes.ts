import { getEditorInsertSpaces, getEditorTabSize } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { sleep } from '../../completions/utils'
import type { Edit } from '../line-diff'

/**
 * Maximum amount of time to spend formatting.
 * If the formatter takes longer than this then we will skip formatting completely.
 */
const FORMATTING_TIMEOUT = 1000

export async function getFormattingChangesForRange(
    document: vscode.TextDocument,
    range: vscode.Range
): Promise<Edit[]> {
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

    return formattingChanges
        .filter(change => range.contains(change.range))
        .map(change => ({
            type: 'insertion',
            range: change.range,
            text: change.newText,
        }))
}
