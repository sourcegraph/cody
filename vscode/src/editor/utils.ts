import * as vscode from 'vscode'

/**
 * Gets the folding ranges for the given document URI.
 *
 * @param uri - The URI of the document to get folding ranges for
 * @param type - Optional type of folding range to filter on:
 *   - 'imports' - Only import folding ranges
 *   - 'comment' - Only comment folding ranges
 *   - 'regions' - All non-import and non-comment folding ranges
 * If no type specified, returns all folding ranges.
 *
 * @returns The array of folding ranges for the document.
 */
export async function getFoldingRange(uri: vscode.Uri, type?: string): Promise<vscode.FoldingRange[]> {
    const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider',
        uri
    )
    switch (type) {
        case 'imports':
            return ranges.filter(r => r.kind === vscode.FoldingRangeKind.Imports)
        case 'comment':
            return ranges.filter(r => r.kind === vscode.FoldingRangeKind.Comment)
        case 'regions':
            return ranges.filter(
                r => r.kind !== vscode.FoldingRangeKind.Imports && r.kind !== vscode.FoldingRangeKind.Comment
            )
        default:
            return ranges
    }
}

/**
 * Gets the folding range containing the active cursor position.
 *
 * @param uri - The URI of the document to get folding ranges for
 * @param activeCursor - The active cursor position
 * @returns The folding range containing the active cursor, or undefined if none found
 */
export async function getCursorFoldingRange(
    uri: vscode.Uri,
    activeCursor: number
): Promise<vscode.Selection | undefined> {
    const ranges = await getFoldingRange(uri).then(r => r.filter(r => r.kind !== 2 && r.kind !== 1))
    // Get the folding range containing the active cursor
    for (const range of ranges) {
        if (range.start <= activeCursor && range.end + 2 >= activeCursor) {
            return new vscode.Selection(range.start, 0, range.end + 2, 0)
        }
    }

    return undefined
}

export function addSelectionToPrompt(prompt: string, code: string): string {
    return prompt + '\nHere is the code: \n<Code>' + code + '</Code>'
}
