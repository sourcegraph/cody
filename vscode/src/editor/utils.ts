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
    const symbols = await getSymbolRanges(uri).then(r => r.filter(s => s.kind === vscode.SymbolKind.Class))
    // Get the folding ranges for the document,
    const ranges = await getFoldingRange(uri).then(r => r.filter(r => r.kind !== 2 && r.kind !== 1 && r.kind !== 3))
    // remove ranges that match the symbols from ranges
    for (const s of symbols) {
        const symbolRange = s.location.range
        for (let i = 0; i < ranges.length; i++) {
            const r = ranges[i]
            if (r.start === symbolRange.start.line && r.end === symbolRange.end.line) {
                ranges.splice(i, 1)
                i--
            }
        }
    }

    // Filter to keep folding ranges that contained other folding ranges
    const filteredRanges = ranges.filter(r => !ranges.some(r2 => r2 !== r && r2.start <= r.start && r2.end >= r.end))
    // Get the folding range containing the active cursor
    const cursorRange = filteredRanges.find(r => r.start <= activeCursor && r.end >= activeCursor)
    if (cursorRange) {
        return new vscode.Selection(cursorRange.start, 0, cursorRange.end + 2, 0)
    }
    return undefined
}

export function addSelectionToPrompt(prompt: string, code: string): string {
    return prompt + '\nHere is the code: \n<Code>' + code + '</Code>'
}

/**
 * Gets the symbol information ranges for the given document URI.
 *
 * @param uri - The URI of the document to get symbol ranges for
 * @returns A promise resolving to an array of SymbolInformation objects
 * representing the symbols in the document.
 */
export async function getSymbolRanges(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
    const ranges = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider',
        uri
    )
    return ranges
}
