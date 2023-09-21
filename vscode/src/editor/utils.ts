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

    if (!ranges?.length) {
        return []
    }

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
    // Get the ranges of all classes and folding ranges in parallel
    const [classes, ranges] = await Promise.all([
        getSymbols(uri)
            .then(r => r?.filter(s => s.kind === vscode.SymbolKind.Class))
            .then(s => s?.map(symbol => symbol.location.range)),
        getFoldingRange(uri).then(r => r?.filter(r => !r.kind)),
    ])
    const cursorRange = getOutermostRangesInsideClasses(classes, ranges, activeCursor)
    if (!cursorRange) {
        console.error('No folding range found containing cursor')
        return undefined
    }

    return new vscode.Selection(cursorRange.start, 0, cursorRange.end + 2, 0)
}

/**
 * NOTE (bee) The purpose of filtering to keep only folding ranges that contain other folding ranges is to find
 * the outermost folding range enclosing the cursor position.
 *
 * Folding ranges can be nested - you may have a folding range for a function that contains folding ranges for inner code blocks.
 *
 * By filtering to ranges that contain other ranges, it removes the inner nested ranges and keeps only the outermost parent ranges.
 *
 * This way when it checks for the range containing the cursor, it will return the outer range that fully encloses the cursor location,
 * rather than an inner range that may only partially cover the cursor line.
 * '
 * However, if we keep the ranges for classes, this will then only return ranges for classes that contain individual methods rather
 * than the outermost range of the methods within a class. So the first step is to remove class ranges.
 */
export function getOutermostRangesInsideClasses(
    classRanges: vscode.Range[],
    foldingRanges: vscode.FoldingRange[],
    activeCursor: number
): vscode.FoldingRange | undefined {
    if (!foldingRanges?.length) {
        return undefined
    }

    // Remove all ranges that are contained within class ranges
    if (classRanges.length) {
        for (const cRange of classRanges) {
            for (let i = 0; i < foldingRanges.length; i++) {
                const r = foldingRanges[i]
                if (Math.abs(r.start - cRange.start.line) <= 1 && Math.abs(r.end - cRange.end.line) <= 1) {
                    foldingRanges.splice(i, 1)
                    i--
                }
            }
        }
    }

    // Filter to only keep folding ranges that contained nested folding ranges (aka removes nested ranges)
    // Get the folding range containing the active cursor
    const cursorRange = foldingRanges
        .filter(r => r && !foldingRanges.some(r2 => r2 !== r && r2.start <= r.start && r2.end >= r.end))
        .find(r => r && r.start <= activeCursor && r.end >= activeCursor)

    return cursorRange || undefined
}

/**
 * Gets the symbol information ranges for the given document URI.
 *
 * @param uri - The URI of the document to get symbol ranges for
 * @returns A promise resolving to an array of SymbolInformation objects
 * representing the symbols in the document.
 */
export async function getSymbols(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
    const symbols =
        (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        )) || []
    return symbols
}

/**
 * Adds the selection range to the prompt string.
 *
 * @param prompt - The original prompt string
 * @param code - The code snippet to include in the prompt
 * @returns The updated prompt string with the code snippet added
 */
export function addSelectionToPrompt(prompt: string, code: string): string {
    return prompt + '\nHere is the code: \n<Code>' + code + '</Code>'
}
