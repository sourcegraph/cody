import * as vscode from 'vscode'

import type { DocumentContext } from '@sourcegraph/cody-shared'

import { completionMatchesSuffix } from '../../completions/is-completion-visible'
import { autoeditsLogger } from '../logger'
import type { CodeToReplaceData } from '../prompt-utils'
import { adjustPredictionIfInlineCompletionPossible } from '../utils'

import type { DecorationInfo, ModifiedLineInfo } from './decorators/base'
import { AutoEditsDefaultRendererManager, type AutoEditsRendererManager } from './manager'

/**
 * For now AutoEditsInlineRendererManager is the same as AutoEditsDefaultRendererManager and the
 * only major difference is in `maybeRenderDecorationsAndTryMakeInlineCompletionResponse` implementation.
 *
 * This extra manager will be removed once we won't have a need to maintain two diff renderers.
 * Currently, it is used to enable the experimental usage of the `InlineDiffDecorator`.
 */
export class AutoEditsInlineRendererManager
    extends AutoEditsDefaultRendererManager
    implements AutoEditsRendererManager
{
    async maybeRenderDecorationsAndTryMakeInlineCompletionResponse(
        originalPrediction: string,
        codeToReplaceData: CodeToReplaceData,
        document: vscode.TextDocument,
        position: vscode.Position,
        docContext: DocumentContext,
        decorationInfo: DecorationInfo
    ): Promise<{
        inlineCompletions: vscode.InlineCompletionItem[] | null
        updatedDecorationInfo: DecorationInfo
    }> {
        const prediction = adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            codeToReplaceData.codeToRewritePrefix,
            codeToReplaceData.codeToRewriteSuffix
        )

        const codeToRewriteAfterCurrentLine = codeToReplaceData.codeToRewriteSuffix.slice(
            docContext.currentLineSuffix.length + 1 // Additional char for newline
        )

        const allTextAfterCursor = getChangedTextAfterCursor(position, decorationInfo)

        const isSuffixMatch =
            // The current line suffix should not require any char removals to render the completion.
            completionMatchesSuffix({ insertText: prediction }, docContext.currentLineSuffix) &&
            // The new lines suggested after the current line must be equal to the prediction.
            prediction.endsWith(codeToRewriteAfterCurrentLine)

        let inlineCompletions: vscode.InlineCompletionItem[] | null = null

        if (isSuffixMatch) {
            const autocompleteResponse = docContext.currentLinePrefix + allTextAfterCursor
            inlineCompletions = [
                new vscode.InlineCompletionItem(
                    autocompleteResponse,
                    new vscode.Range(
                        document.lineAt(position).range.start,
                        document.lineAt(position).range.end
                    )
                ),
            ]
            autoeditsLogger.logDebug('Autocomplete Inline Response: ', autocompleteResponse)

            // TODO: create a new object instead of modifying in place
            decorationInfo.modifiedLines = decorationInfo.modifiedLines.map(line => {
                if (line.originalLineNumber === position.line) {
                    // Keep all removals changes
                    // Keep insertions only before the current cursor position
                    // because others will be handled by the inline completion item.
                    // TODO: handle insertions on the boundary of the cursor position.
                    // TODO: ignore empty space removals at the start of the current line
                    // example: code-matching-eval/edits_experiments/examples/renderer-testing-examples/working-okay/copilot-nes-question-autoedits.py:64:0
                    line.changes = line.changes.filter(
                        change =>
                            change.type === 'delete' ||
                            (change.type === 'insert' && change.range.end.character < position.character)
                    )
                }

                return line
            })
        }

        await this.showEdit({
            document,
            range: codeToReplaceData.range,
            prediction,
            decorationInfo,
        })

        return { inlineCompletions, updatedDecorationInfo: decorationInfo }
    }
}

function getChangedTextAfterCursor(
    cursorPosition: vscode.Position,
    decorationInfo: DecorationInfo
): string {
    const cursorLine = cursorPosition.line
    const changesAfterCursor: Array<{
        lineNumber: number
        type: 'added' | 'removed' | 'modified'
        text: string
    }> = []

    // Collect and process added lines after the cursor
    for (const lineInfo of decorationInfo.addedLines) {
        if (lineInfo.modifiedLineNumber >= cursorLine) {
            changesAfterCursor.push({
                lineNumber: lineInfo.modifiedLineNumber,
                type: 'added',
                text: lineInfo.text,
            })
        }
    }

    // Collect and process removed lines after the cursor
    for (const lineInfo of decorationInfo.removedLines) {
        if (lineInfo.originalLineNumber !== undefined && lineInfo.originalLineNumber >= cursorLine) {
            changesAfterCursor.push({
                lineNumber: lineInfo.originalLineNumber,
                type: 'removed',
                text: lineInfo.text,
            })
        }
    }

    // Collect and process modified lines after the cursor
    for (const lineInfo of decorationInfo.modifiedLines) {
        if (lineInfo.modifiedLineNumber >= cursorLine) {
            // Extract the text changes within the modified line
            const lineChangesText = extractTextFromLineChangesInOrder(cursorPosition, lineInfo)
            if (lineChangesText) {
                changesAfterCursor.push({
                    lineNumber: lineInfo.modifiedLineNumber,
                    type: 'modified',
                    text: lineChangesText,
                })
            }
        }
    }

    // Sort changes by line number from lowest to highest
    changesAfterCursor.sort((a, b) => a.lineNumber - b.lineNumber)

    // Combine the texts in order
    const resultText = changesAfterCursor.map(change => change.text).join('\n')

    return resultText
}

function extractTextFromLineChangesInOrder(
    position: vscode.Position,
    lineInfo: ModifiedLineInfo
): string {
    // Ensure that line changes are processed from left to right
    // Sort the changes by their range's start position
    return lineInfo.changes
        .filter(c => c.range.end.character >= position.character)
        .sort((a, b) => a.range.start.compareTo(b.range.start))
        .reduce((a, i) => {
            a += i.text.slice(Math.max(position.character - i.range.start.character, 0))
            return a
        }, '')
}
