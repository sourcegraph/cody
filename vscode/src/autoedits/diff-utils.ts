import { diff } from 'fast-myers-diff'
import * as vscode from 'vscode'
import { combineRanges } from './utils'

/**
 * Checks if the changes between current and predicted text only consist of added lines
 */
export function isPureAddedLines(currentFileText: string, predictedFileText: string): boolean {
    const currentLines = currentFileText.split('\n')
    const predictedLines = predictedFileText.split('\n')
    for (const [from1, to1, from2, to2] of diff(currentLines, predictedLines)) {
        if (to2 - to1 > from2 - from1) {
            return true
        }
    }
    return false
}

/**
 * Calculates the ranges of text that will be removed in the document
 */
export function calculateRemovedRanges(
    document: vscode.TextDocument,
    currentFileText: string,
    predictedFileText: string
): vscode.Range[] {
    const edits = diff(currentFileText, predictedFileText)
    const allRangesToRemove: vscode.Range[] = []
    for (const [from1, to1] of edits) {
        const startPos = document.positionAt(from1)
        const endPos = document.positionAt(to1)
        allRangesToRemove.push(new vscode.Range(startPos, endPos))
    }
    return combineRanges(allRangesToRemove, 0)
}
