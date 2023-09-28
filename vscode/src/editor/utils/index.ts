import * as vscode from 'vscode'

import { getTargetFoldingRange } from './folding-ranges'

/**
 * Gets the folding range containing the target position to use as a smart selection.
 *
 * This should only be used when there is no existing selection, as a fallback.
 *
 * The smart selection removes the need to manually highlight code before running a command.
 * Instead, this tries to identify the folding range containing the user's cursor to use as the selection range.
 * For example, a docstring can be added to the target folding range when running the /doc command.
 *
 * NOTE: Smart selection should be treated as a fallback, since it guesses the user's intent.
 * A manual selection truly reflects the user's intent and should be preferred when possible.
 * Smart selection can be unreliable in some cases. Callers needing the true selection range
 * should always use the manual selection method to ensure accuracy.
 *
 * @param uri - The document URI.
 * @param target - The target position in the document.
 *
 * @returns The folding range containing the target position, if one exists. Otherwise returns undefined.
 */
export async function getSmartSelection(uri: vscode.Uri, target: number): Promise<vscode.Selection | undefined> {
    return getTargetFoldingRange(uri, target)
}

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
export async function getFoldingRanges(
    uri: vscode.Uri,
    type?: vscode.FoldingRangeKind
): Promise<vscode.FoldingRange[]> {
    const ranges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
        'vscode.executeFoldingRangeProvider',
        uri
    )

    if (!ranges?.length) {
        return []
    }

    switch (type) {
        case vscode.FoldingRangeKind.Imports:
            return ranges.filter(r => r.kind === vscode.FoldingRangeKind.Imports)
        case vscode.FoldingRangeKind.Comment:
            return ranges.filter(r => r.kind === vscode.FoldingRangeKind.Comment)
        case vscode.FoldingRangeKind.Region:
            return ranges.filter(r => r.kind !== vscode.FoldingRangeKind.Region)
        default:
            return ranges
    }
}

/**
 * Gets the symbol information for the given document URI.
 *
 * @param uri - The URI of the document to get symbols for.
 *
 * @returns A promise that resolves to an array of SymbolInformation objects representing the symbols in the document.
 */
export async function getSymbols(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
    return (
        (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        )) || []
    )
}
