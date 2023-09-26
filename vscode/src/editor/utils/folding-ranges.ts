import * as vscode from 'vscode'

import { getFoldingRanges, getSymbols } from '.'

/**
 * Gets the folding range containing the target position.
 *
 * NOTE: Use getSmartSelection from utils/index.ts instead
 *
 * @param uri - The URI of the document to get folding ranges for
 * @param target - The target position number
 * @returns The folding range containing the target position, or undefined if none found
 */
export async function getTargetFoldingRange(uri: vscode.Uri, target: number): Promise<vscode.Selection | undefined> {
    // Check if symbols is available in the doc by its file uri and look for language id
    const doc = await vscode.workspace.openTextDocument(uri)
    // Remove text-based languages that don't support symbols or folding ranges
    const textBaseLangIds = ['markdown', 'plaintext', 'json', 'sql']
    const isSupported = !textBaseLangIds.includes(doc.languageId)

    // Get the ranges of all classes and folding ranges in parallel
    const [ranges, classes] = await Promise.all([
        getFoldingRanges(uri).then(r => r?.filter(r => !r.kind)),
        isSupported
            ? getSymbols(uri)
                  .then(r => r?.filter(s => s.kind === vscode.SymbolKind.Class))
                  .then(s => s?.map(symbol => symbol.location.range))
            : [],
    ])

    // If lanaguage id not available, find class object ranges heuristically
    const classRanges = isSupported ? classes : await getOuterClassFoldingRanges(ranges, uri)

    const targetRange = getNonClassOutermostFoldingRanges(classRanges, ranges, target, isSupported)
    if (!targetRange) {
        console.error('No folding range found containing cursor')
        return undefined
    }

    return new vscode.Selection(targetRange.start, 0, targetRange.end + 2, 0)
}

/**
 * Gets the outermost non-class folding range containing the target position.
 *
 * NOTE: exported for testing purposes only
 *
 * @param classRanges The ranges of folding regions for classes in the document.
 * @param foldingRanges The folding ranges for the entire document.
 * @param target The target line number to find the enclosing range for.
 * @param isPlainText Optional flag indicating if the document is plain text.
 * @returns The outermost non-class folding range containing the target position, or undefined if not found.
 */
export function getNonClassOutermostFoldingRanges(
    classRanges: vscode.Range[],
    foldingRanges: vscode.FoldingRange[],
    target: number,
    isPlainText?: boolean
): vscode.FoldingRange | undefined {
    if (!foldingRanges?.length) {
        return undefined
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

    // Remove the ranges of classes from the folding ranges
    const classLessRanges = removeOutermostFoldingRanges(classRanges, foldingRanges)

    // Filter to only keep folding ranges that contained nested folding ranges (aka removes nested ranges)
    // Get the folding range containing the active cursor
    const cursorRange = findTargetFoldingRange(removeNestedFoldingRanges(classLessRanges, isPlainText), target)

    return cursorRange || undefined
}

/**
 * Finds the folding range containing the given target position.
 *
 * NOTE: exported for testing purposes only
 *
 * @param ranges - The array of folding ranges to search.
 * @param target - The position to find the containing range for.
 * @returns The folding range containing the target position, or undefined if not found.
 */
export function findTargetFoldingRange(ranges: vscode.FoldingRange[], target: number): vscode.FoldingRange | undefined {
    return ranges.find(range => range.start <= target && range.end >= target)
}

// ------------------------ HELPER FUNCTIONS ------------------------ //

/**
 * Gets the outermost folding ranges for classes in the given document.
 *
 * @param ranges - The folding ranges for the document
 * @param uri - The URI of the document
 * @returns The outermost folding ranges corresponding to classes in the document.
 */
async function getOuterClassFoldingRanges(ranges: vscode.FoldingRange[], uri: vscode.Uri): Promise<vscode.Range[]> {
    // Because vscode.FoldingRangeKind.Class is not defined in folding range, we first remove all the nested ranges
    // we should first find the range with the largest end range to identify class ranges
    const outermostFoldingRanges = removeNestedFoldingRanges(ranges)

    // Check outerRanges array for the string 'class' in each starting line to confirm they are class ranges
    // Filter the ranges to remove ranges that did not contain classes in their first line
    const doc = await vscode.workspace.openTextDocument(uri)
    const firstLines = outermostFoldingRanges.map(r => doc.lineAt(r.start).text)

    return outermostFoldingRanges
        .filter((r, i) => firstLines[i].includes('class') || firstLines[i].startsWith('object'))
        .map(r => new vscode.Range(r.start, 0, r.end, 0))
}

/**
 * Removes the outermost folding ranges from the given foldingRanges array that correspond to the given classRanges.
 *
 * This filters the foldingRanges array to remove any folding ranges that match the line positions of the given classRanges.
 *
 * Used to remove folding ranges for entire classes after we have already processed folding ranges for methods within the classes.
 *
 * @param classRanges Array of vscode.Range objects representing folding ranges for classes
 * @param foldingRanges Array of vscode.FoldingRange objects representing all folding ranges in the document
 * @returns Filtered array containing only foldingRanges that do not match ranges for classes
 */
function removeOutermostFoldingRanges(
    classRanges: vscode.Range[],
    foldingRanges: vscode.FoldingRange[]
): vscode.FoldingRange[] {
    if (!classRanges.length || !foldingRanges?.length) {
        return foldingRanges
    }

    for (const cRange of classRanges) {
        for (let i = 0; i < foldingRanges.length; i++) {
            const r = foldingRanges[i]
            if (Math.abs(r.start - cRange.start.line) <= 1 && Math.abs(r.end - cRange.end.line) <= 1) {
                foldingRanges.splice(i, 1)
                i--
            }
        }
    }

    return foldingRanges
}

/**
 * Removes nested folding ranges from the given array of folding ranges.
 *
 * This filters the input array to only contain folding ranges that do not have any nested child folding ranges within them.
 *
 * Nested folding ranges occur when you have a folding range (e.g. for a function) that contains additional nested folding ranges
 * (e.g. for inner code blocks).
 *
 * By removing the nested ranges, you are left with only the top-level outermost folding ranges.
 *
 * @param ranges - Array of folding ranges
 * @returns Array containing only folding ranges that do not contain any nested child ranges
 */
function removeNestedFoldingRanges(ranges: vscode.FoldingRange[], isTextBased = false): vscode.FoldingRange[] {
    const filtered = isTextBased ? combineNeighborFoldingRanges(ranges) : ranges

    return filtered.filter(
        cur => !filtered.some(next => next !== cur && next.start <= cur.start && next.end >= cur.end)
    )
}

/**
 * Combines neighboring folding ranges in the given array into single ranges.
 *
 * This looks for folding ranges that end on the line before the next range starts,
 * indicating they are neighbors with no gap between. It combines such neighbors
 * into a single range from the start of the first to the end of the last.
 *
 * @param ranges - Array of folding ranges to combine
 * @returns Array of combined folding ranges
 */
function combineNeiborFoldingRanges(ranges: vscode.FoldingRange[]): vscode.FoldingRange[] {
    // look for ranges that end at -1 position from the next folding range
    // then combine them into a single range where the new range will be the union of the start positions of the first range that connected to the n next range(s), and the end position of the last range in the chain
    let chains: vscode.FoldingRange[] = []
    const combinedRanges: vscode.FoldingRange[] = []
    // iterate through ranges and add connected ranges into chains array, clean the chains array everytime we find a disconnected range
    for (let i = 0; i < ranges.length; i++) {
        const range = ranges[i]
        // Check if current range is connected to previous range
        const prevRange = ranges[i - 1]
        if (prevRange && prevRange.end === range.start - 1) {
            chains.push(prevRange)
        }

        // Check if current range is connected to the last combined range
        const lastCombinedRange = combinedRanges.at(-1)
        // If connected, add to chains array
        if (lastCombinedRange && lastCombinedRange.end === range.start - 1) {
            combinedRanges.pop()
            chains = [lastCombinedRange, range]
        }

        if (chains.length > 1) {
            // combine the connected ranges into a single range after finding a disconnected range
            // we will get the first item in chain and last item to construct the combined range
            // where the start is the start of first range and end is end of last range
            const lastConnectedRange = chains.at(-1)
            if (lastConnectedRange) {
                // push combined range
                combinedRanges.push(new vscode.FoldingRange(chains[0].start, lastConnectedRange.end))
            }
        } else {
            combinedRanges.push(range)
        }

        // clean chains array
        chains = []
    }
    return combinedRanges
}
