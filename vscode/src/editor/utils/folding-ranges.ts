import * as vscode from 'vscode'

import { getFoldingRanges, getSymbols } from '.'

/**
 * Gets the folding range containing the target position.
 * Target position that sits outside of any folding range will return undefined.
 *
 * NOTE: Use getSmartSelection from utils/index.ts instead
 *
 * @param uri - The URI of the document to get folding ranges for
 * @param targetLine - The target line position number
 * @returns The folding range containing the target position, or undefined if none found
 */
export async function getTargetFoldingRange(
    uri: vscode.Uri,
    targetLine: number
): Promise<vscode.Selection | undefined> {
    // Check if symbol support is available for the document by its URI and look for the language ID
    const doc = await vscode.workspace.openTextDocument(uri)
    if (!doc) {
        return undefined
    }

    // Documents with language ID 'plaintext' do not have symbol support in VS Code
    // In those cases, try to find class ranges heuristically
    const isPlainText = doc.languageId === 'plaintext'

    // Get the ranges of all folding regions and classes in parallel
    const [ranges, classes] = await Promise.all([
        getFoldingRanges(uri).then(r => r?.filter(r => !r.kind)),
        isPlainText
            ? []
            : getSymbols(uri)
                  .then(r => r?.filter(s => s.kind === vscode.SymbolKind.Class))
                  .then(s => s?.map(symbol => symbol.location.range)),
    ])

    // To find the nested folding range containing the target line:
    // 1. Remove ranges for classes from the folding ranges
    // 2. Filter the remaining ranges to only outermost ranges containing target line

    // This finds the outermost range fully enclosing the target line,
    // rather than an inner range partially covering the line.
    const classRanges = isPlainText ? await getOuterClassFoldingRanges(ranges, uri) : classes

    const targetRange = getTargetRange(classRanges, ranges, targetLine, isPlainText)

    if (!targetRange) {
        console.error('No folding range found containing target line')
        return undefined
    }

    return new vscode.Selection(targetRange.start, 0, Math.min(targetRange.end + 2, doc.lineCount), 0)
}

/**
 * Gets the nested outermost folding range containing the target position.
 *
 * NOTE: exported for testing purposes only
 *
 * @param classRanges The ranges of folding regions for classes in the document.
 * @param foldingRanges The folding ranges for the entire document.
 * @param targetLine The target line number to find the enclosing range for.
 * @param isPlainText Optional flag indicating if the document is plain text.
 * @returns The outermost non-class folding range containing the target position, or undefined if not found.
 */
export function getTargetRange(
    classRanges: vscode.Range[],
    foldingRanges: vscode.FoldingRange[],
    targetLine: number,
    isPlainText?: boolean
): vscode.FoldingRange | undefined {
    if (!foldingRanges?.length) {
        return undefined
    }

    // Remove the ranges of classes from the folding ranges
    const classLessRanges = removeOutermostFoldingRanges(classRanges, foldingRanges)

    // Filter to only keep folding ranges that contained nested folding ranges (aka removes nested ranges)
    // Get the folding range containing the active cursor
    const cursorRange = findTargetFoldingRange(removeNestedFoldingRanges(classLessRanges, isPlainText), targetLine)

    return cursorRange || undefined
}

/**
 * Finds the folding range containing the given target position.
 *
 * NOTE: exported for testing purposes only
 *
 * @param ranges - The array of folding ranges to search.
 * @param targetLine - The position to find the containing range for.
 * @returns The folding range containing the target position, or undefined if not found.
 */
export function findTargetFoldingRange(
    ranges: vscode.FoldingRange[],
    targetLine: number
): vscode.FoldingRange | undefined {
    return ranges.find(range => range.start <= targetLine && range.end >= targetLine)
}

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
 * Removes outermost folding ranges from the given folding ranges array.
 *
 * @param outermostRanges - Array of outermost folding ranges to remove
 * @param foldingRanges - Array of folding ranges
 * @returns Updated array of folding ranges with outermost ranges removed
 */
function removeOutermostFoldingRanges(
    outermostRanges: vscode.Range[],
    foldingRanges: vscode.FoldingRange[]
): vscode.FoldingRange[] {
    if (!outermostRanges.length || !foldingRanges?.length) {
        return foldingRanges
    }

    for (const oRanges of outermostRanges) {
        for (let i = 0; i < foldingRanges.length; i++) {
            const r = foldingRanges[i]
            if (Math.abs(r.start - oRanges.start.line) <= 1 && Math.abs(r.end - oRanges.end.line) <= 1) {
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
 * Combines adjacent folding ranges in the given array into single combined ranges.
 *
 * This will iterate through the input ranges, and combine any ranges that are adjacent (end line of previous connects to start line of next)
 * into a single combined range.
 *
 * @param ranges - Array of folding ranges to combine
 * @returns Array of combined folding ranges
 */
function combineNeighborFoldingRanges(ranges: vscode.FoldingRange[]): vscode.FoldingRange[] {
    const combinedRanges: vscode.FoldingRange[] = []

    let currentChain: vscode.FoldingRange[] = []
    let lastChainRange = currentChain.at(-1)

    for (const range of ranges) {
        // set the lastChainRange to the last range in the current chain
        lastChainRange = currentChain.at(-1)
        if (currentChain.length > 0 && lastChainRange?.end === range.start - 1) {
            // If this range connects to the previous one, add it to the current chain
            currentChain.push(range)
        } else {
            // Otherwise, start a new chain
            if (currentChain.length > 0 && lastChainRange) {
                // If there was a previous chain, combine it into a single range
                combinedRanges.push(new vscode.FoldingRange(currentChain[0].start, lastChainRange.end))
            }

            currentChain = [range]
        }
    }

    // Add the last chain
    if (lastChainRange && currentChain.length > 0) {
        combinedRanges.push(new vscode.FoldingRange(currentChain[0].start, lastChainRange.end))
    }

    return combinedRanges
}
