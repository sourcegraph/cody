import * as vscode from 'vscode'

import type { DocumentContext } from '@sourcegraph/cody-shared'

import { completionMatchesSuffix } from '../../completions/is-completion-visible'
import { getNewLineChar } from '../../completions/text-processing'
import { autoeditsLogger } from '../logger'
import type { CodeToReplaceData } from '../prompt/prompt-utils'
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

        const { insertText, usedChangeIds } = getCompletionText({
            prediction: originalPrediction,
            cursorPosition: position,
            decorationInfo,
        })

        // The current line suffix should not require any char removals to render the completion.
        const isSuffixMatch = completionMatchesSuffix({ insertText }, docContext.currentLineSuffix)

        let inlineCompletions: vscode.InlineCompletionItem[] | null = null

        if (isSuffixMatch) {
            const completionText = docContext.currentLinePrefix + insertText

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

        function withoutUsedChanges<T extends { id: string }>(array: T[]): T[] {
            return array.filter(item => !usedChangeIds.has(item.id))
        }

        // Filter out changes that were used to render the inline completion.
        const decorationInfoWithoutUsedChanges = {
            addedLines: withoutUsedChanges(decorationInfo.addedLines),
            removedLines: withoutUsedChanges(decorationInfo.removedLines),
            modifiedLines: withoutUsedChanges(decorationInfo.modifiedLines).map(c => ({
                ...c,
                changes: withoutUsedChanges(c.changes),
            })),
            unchangedLines: withoutUsedChanges(decorationInfo.unchangedLines),
        }

        await this.showEdit({
            document,
            range: codeToReplaceData.range,
            prediction,
            decorationInfo: decorationInfoWithoutUsedChanges,
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
}: {
    prediction: string
    cursorPosition: vscode.Position
    decorationInfo: DecorationInfo
}): {
    insertText: string
    usedChangeIds: Set<string>
} {
    const usedChangeIds = new Set<string>()
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
            // Collect candidate IDs rendered as a part of the inline completion item
            // so that we don't decorate it with line decorations later.
            usedChangeIds.add(candidate.id)
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
                    .filter(
                        lineChange => lineChange.originalRange.end.character >= cursorPosition.character
                    )
                    .sort((a, b) => a.originalRange.start.compareTo(b.originalRange.start))
                    .reduce((lineChangeText, lineChange) => {
                        // If a line change starts before the cursor position, cut if off from this point.
                        const textAfterCursor = lineChange.text.slice(
                            Math.max(
                                cursorPosition.character - lineChange.originalRange.start.character,
                                0
                            )
                        )

                        if (textAfterCursor.length && lineChange.type === 'insert') {
                            // Collect this line change IDs rendered as a part of the inline completion item
                            // so that we don't decorate it with line decorations later.
                            usedChangeIds.add(lineChange.id)
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
                // Collect this line change IDs rendered as a part of the inline completion item
                // so that we don't decorate it with line decorations later.
                usedChangeIds.add(change.id)
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

    return {
        insertText: lines.join(getNewLineChar(prediction)),
        usedChangeIds,
    }
}
