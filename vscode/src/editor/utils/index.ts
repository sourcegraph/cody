import * as vscode from 'vscode'

import { getTargetFoldingRange } from './folding-ranges'

/**
 * Gets a smart selection for the given document and target position.
 *
 * @param uri - The document URI.
 * @param target - The target position in the document.
 *
 * @returns A Selection containing the folding range enclosing the target position, if one exists. Otherwise returns undefined.
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
export async function getFoldingRanges(uri: vscode.Uri, type?: string): Promise<vscode.FoldingRange[]> {
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
 * Gets the symbol information for the given document URI.
 *
 * @param uri - The URI of the document to get symbols for.
 *
 * @returns A promise that resolves to an array of SymbolInformation objects representing the symbols in the document.
 */
export async function getSymbols(uri: vscode.Uri): Promise<vscode.SymbolInformation[]> {
    const symbols =
        (await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            uri
        )) || []
    return symbols
}
