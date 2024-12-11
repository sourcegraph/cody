import * as vscode from 'vscode'

import type { DocumentContext } from '@sourcegraph/cody-shared'

import { completionMatchesSuffix } from '../../completions/is-completion-visible'
import { getNewLineChar } from '../../completions/text-processing'
import { autoeditsLogger } from '../logger'
import type { CodeToReplaceData } from '../prompt-utils'
import { adjustPredictionIfInlineCompletionPossible } from '../utils'

import type {
    AddedLineInfo,
    DecorationInfo,
    ModifiedLineInfo,
    UnchangedLineInfo,
} from './decorators/base'
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

        const completionTextAfterCursor = getCompletionText({
            prediction: originalPrediction,
            cursorPosition: position,
            decorationInfo,
        })

        // The current line suffix should not require any char removals to render the completion.
        const isSuffixMatch = completionMatchesSuffix(
            { insertText: completionTextAfterCursor },
            docContext.currentLineSuffix
        )

        let inlineCompletions: vscode.InlineCompletionItem[] | null = null

        if (isSuffixMatch) {
            const completionText = docContext.currentLinePrefix + completionTextAfterCursor

            inlineCompletions = [
                new vscode.InlineCompletionItem(
                    completionText,
                    new vscode.Range(
                        document.lineAt(position).range.start,
                        document.lineAt(position).range.end
                    )
                ),
            ]

            autoeditsLogger.logDebug('Autocomplete Inline Response: ', completionText)
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

/**
 * Extracts text from the prediction that we can be rendered as a part of the
 * inline completion item ghost text.
 *
 * For example:
 * █     – cursor position
 * ~asd~ – inline decorated removed code
 * [asd] – inline completion provider ghost text
 *
 * 1. Initial document state:
 *
 * const dataStyles = {
 *   top 10px left 10px fixed
 *   zIndex: '1000',
 *   color: '#fff',
 * }
 *
 * 2. Predicted change:
 *
 * const dataStyles = {
 *   top: '10px',
 *   left: '10px',
 *   position: 'fixed',
 *   zIndex: '1000',
 *   color: '#fff',
 * }
 *
 * 3. Document with inline completion item ghost text and inline decorations:
 *
 * const dataStyles = {
 *   top~ 10~█~px left~[: ']10px~ fixed~[',]
 *   [left: '10px',]
 *   [position: 'fixed',]
 *   zIndex: '1000',
 *   color: '#fff',
 * }
 *
 */
export function getCompletionText({
    prediction,
    cursorPosition,
    decorationInfo,
}: { prediction: string; cursorPosition: vscode.Position; decorationInfo: DecorationInfo }): string {
    const candidates = [...decorationInfo.modifiedLines, ...decorationInfo.addedLines]

    let currentLine = cursorPosition.line
    const lines = []

    // We cannot render disjoint new line with the inline completion item ghost text because
    // the replacement range is limited to the current line, so we check consecutive lines for
    // available insertions starting from the current cursor position line.
    while (true) {
        let candidateText: string | undefined = undefined
        let candidate: AddedLineInfo | ModifiedLineInfo | UnchangedLineInfo | undefined =
            candidates.find(c => c.modifiedLineNumber === currentLine)

        // In cases when the current line is unchanged but there are added lines right after it
        // we can keep all the text from the current line.
        if (!candidate && currentLine === cursorPosition.line) {
            candidate = decorationInfo.unchangedLines.find(c => c.originalLineNumber === currentLine)
        }

        // If no changes are found on the current candidate line, it means we reached the end of inserted
        // text that can be rendered with the inline completion item provider.
        if (!candidate) {
            break
        }

        if (candidate.type === 'added') {
            // TODO(valery): avoid modifying array items in place, make side-effects obvious to the caller.
            // Mark this added line as rendered as a part of the inline completion item
            // so that we don't decorate it with line decorations later.
            candidate.usedAsInlineCompletion = true
            candidateText = candidate.text
        }

        if (
            currentLine === cursorPosition.line &&
            (candidate.type === 'modified' || candidate.type === 'unchanged')
        ) {
            if (candidate.type === 'unchanged') {
                candidateText = candidate.text.slice(cursorPosition.character)
            }

            // If a cursor line is modified, we will decorate deletions with line decorations
            // and show all insertions as a ghost text with the inline completion item provider.
            //
            // To do that we extract all the inserted text after the cursor position.
            if (candidate.type === 'modified') {
                candidateText = candidate.changes
                    .filter(lineChange => lineChange.range.end.character >= cursorPosition.character)
                    .sort((a, b) => a.range.start.compareTo(b.range.start))
                    .reduce((lineChangeText, lineChange) => {
                        // If a line change starts before the cursor position, cut if off from this point.
                        const textAfterCursor = lineChange.text.slice(
                            Math.max(cursorPosition.character - lineChange.range.start.character, 0)
                        )

                        if (textAfterCursor.length && lineChange.type === 'insert') {
                            // TODO(valery): avoid modifying array items in place, make side-effects obvious to the caller.
                            // Mark this line change as rendered as a part of the inline completion item
                            // so that we don't decorate it with line decorations later.
                            lineChange.usedAsInlineCompletion = true
                        }

                        lineChangeText += textAfterCursor
                        return lineChangeText
                    }, '')
            }
        }

        // Handle cases where there's an empty line after the cursor and prediction adds a new line there.
        // In that case our diff logic mark the next empty line as modified with insertions only.
        // We can still leverage cases like this to render this added line as a part of the inline completion item.
        if (
            candidate.type === 'modified' &&
            currentLine !== cursorPosition.line &&
            candidate.oldText.trim() === '' &&
            candidate.changes.every(c => c.type === 'insert')
        ) {
            for (const change of candidate.changes) {
                change.usedAsInlineCompletion = true
            }

            candidateText = candidate.newText
        }

        // If one of the candidate passed one of the conditions above, the `candidateText` variable is not
        // `undefined` anymore and we can check the next line.
        if (candidateText !== undefined) {
            lines.push(candidateText)
            currentLine++
            continue
        }

        break
    }

    return lines.join(getNewLineChar(prediction))
}
