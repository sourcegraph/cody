import type { URI } from 'vscode-uri'
import * as vscode from 'vscode'
import { findLast } from 'lodash'
import { wrapInActiveSpan } from '@sourcegraph/cody-shared'
/**
 * Gets folding ranges for the given URI.
 * @param uri - The URI of the document to get folding ranges for.
 * @param type - Optional type of folding ranges to get. Can be 'imports', 'comment' or 'all'. Default 'all'.
 * @param getLastItem - Optional boolean whether to only return the last range of the given type. Default false.
 * @returns A promise resolving to the array of folding ranges, or undefined if none.
 *
 * This calls the built-in VS Code folding range provider to get folding ranges for the given URI.
 * It can filter the results to only return ranges of a certain type, like imports or comments.
 * The getLastItem flag returns just the last range of the given type.
 */
export async function getFoldingRanges(
    uri: URI,
    type?: 'imports' | 'comment' | 'all',
    getLastItem?: boolean
): Promise<vscode.FoldingRange[] | undefined> {
    return wrapInActiveSpan('commands.context.foldingRange', async span => {
        // Run built-in command to get folding ranges
        const foldingRanges = await vscode.commands.executeCommand<vscode.FoldingRange[]>(
            'vscode.executeFoldingRangeProvider',
            uri
        )

        if (type === 'all') {
            return foldingRanges
        }

        const kind =
            type === 'imports' ? vscode.FoldingRangeKind.Imports : vscode.FoldingRangeKind.Comment

        if (!getLastItem) {
            const ranges = foldingRanges?.filter(range => range.kind === kind)
            return ranges
        }

        // Get the line number of the last import statement
        const lastKind = foldingRanges
            ? findLast(foldingRanges, range => range.kind === kind)
            : undefined

        return lastKind ? [lastKind] : []
    })
}
