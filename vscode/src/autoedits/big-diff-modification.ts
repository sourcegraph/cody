import type * as vscode from 'vscode'
import { CHARACTER_REGEX, getDecorationInfo } from './renderer/diff-utils'

export function isBigModification(
    document: vscode.TextDocument,
    prediction: string,
    codeToReplaceRange: vscode.Range,
    fractionOfCodeToRemoveThreshold = 0.3,
    minCharactersRemoveThreshold = 300
): boolean {
    const codeToReplaceText = document.getText(codeToReplaceRange)
    const decorationInfo = getDecorationInfo(codeToReplaceText, prediction, CHARACTER_REGEX)
    let removedChars = 0
    for (const line of decorationInfo.removedLines) {
        removedChars += line.text.length
    }
    for (const line of decorationInfo.modifiedLines) {
        for (const change of line.changes) {
            if (change.type === 'delete') {
                removedChars += change.text.length
            }
        }
    }

    const originalChars = codeToReplaceText.length
    const fractionOfCodeToRemove = removedChars / originalChars
    const isBigModification =
        fractionOfCodeToRemove > fractionOfCodeToRemoveThreshold &&
        removedChars > minCharactersRemoveThreshold

    return isBigModification
}
