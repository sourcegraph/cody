import type * as vscode from 'vscode'

import type { DocumentContext } from '@sourcegraph/cody-shared'

import { getCurrentDocContext } from './get-current-doc-context'

interface CompletionPositions {
    invokedPosition: vscode.Position
    latestPosition: vscode.Position
}

export function getLatestVisibilityContext({
    invokedPosition,
    invokedDocument,
    inlineCompletionContext,
    docContext,
    activeTextEditor,
    maxPrefixLength,
    maxSuffixLength,
    shouldTakeSuggestWidgetSelectionIntoAccount,
}: {
    activeTextEditor: vscode.TextEditor
    docContext: DocumentContext
    invokedDocument: vscode.TextDocument
    invokedPosition: vscode.Position
    inlineCompletionContext: vscode.InlineCompletionContext | undefined
    maxPrefixLength: number
    maxSuffixLength: number
    shouldTakeSuggestWidgetSelectionIntoAccount(
        lastRequest: {
            document: vscode.TextDocument
            position: vscode.Position
            context: vscode.InlineCompletionContext
        } | null,
        latestRequest: {
            document: vscode.TextDocument
            position: vscode.Position
            context?: vscode.InlineCompletionContext
        }
    ): boolean
}): {
    inlineCompletionContext: vscode.InlineCompletionContext | undefined
    position: vscode.Position
    document: vscode.TextDocument
    docContext: DocumentContext
    takeSuggestWidgetSelectionIntoAccount: boolean
} {
    const latestPosition = activeTextEditor.selection.active
    const latestDocument = activeTextEditor.document

    // If the cursor position is the same as the position of the completion request, we should use
    // the provided context. This allows us to re-use useful information such as `selectedCompletionInfo`
    const latestInlineCompletionContext = latestPosition.isEqual(invokedPosition)
        ? inlineCompletionContext
        : undefined

    const takeSuggestWidgetSelectionIntoAccount = latestInlineCompletionContext
        ? shouldTakeSuggestWidgetSelectionIntoAccount(
              {
                  document: invokedDocument,
                  position: invokedPosition,
                  context: latestInlineCompletionContext,
              },
              {
                  document: latestDocument,
                  position: latestPosition,
                  context: latestInlineCompletionContext,
              }
          )
        : false

    if (latestPosition !== undefined && !latestPosition.isEqual(invokedPosition)) {
        return {
            // The cursor position has changed since the request was made.
            // This is likely due to another completion request starting, and this request staying in-flight.
            // We must update the `position`, `context` and associated values
            position: latestPosition,
            document: latestDocument,
            inlineCompletionContext: latestInlineCompletionContext,
            takeSuggestWidgetSelectionIntoAccount,
            docContext: getCurrentDocContext({
                document: latestDocument,
                position: latestPosition,
                maxPrefixLength,
                maxSuffixLength,
                // We ignore the current context selection if completeSuggestWidgetSelection is not enabled
                context: takeSuggestWidgetSelectionIntoAccount
                    ? latestInlineCompletionContext
                    : undefined,
            }),
        }
    }

    return {
        position: invokedPosition,
        document: latestDocument,
        inlineCompletionContext,
        docContext,
        takeSuggestWidgetSelectionIntoAccount,
    }
}

export function isCompletionVisible(
    insertText: string,
    document: vscode.TextDocument,
    positions: CompletionPositions,
    docContext: DocumentContext,
    context: vscode.InlineCompletionContext | undefined,
    completeSuggestWidgetSelection: boolean,
    abortSignal: AbortSignal | undefined
): boolean {
    // There are these cases when a completion is being returned here but won't
    // be displayed by VS Code.
    //
    // - When the abort signal was already triggered and a new completion
    //   request was stared.
    //
    // - When the VS Code completion popup is open and we suggest a completion
    //   that does not match the currently selected completion. For now we make
    //   sure to not log these completions as displayed.
    //
    //   This check is only needed if we do not already take the completion
    //   popup into account when generating completions as we do with the
    //   completeSuggestWidgetSelection flag
    //
    // - When no completion contains all characters that are in the suffix of
    //   the current line. This happens because we extend the insert range of
    //   the completion to the whole line and any characters that are in the
    //   suffix that would be overwritten, will need to be part of the inserted
    //   completion (the VS Code UI does not allow character deletion). To test
    //   for this, we have to do a per-character diff.
    const isAborted = abortSignal ? abortSignal.aborted : false
    const isMatchingPopupItem = completeSuggestWidgetSelection
        ? true
        : completionMatchesPopupItem(insertText, document, context)
    const isMatchingSuffix = completionMatchesSuffix(insertText, docContext.currentLineSuffix)
    const isMatchingPrefix = completionMatchesPrefix(insertText, document, positions)
    const isVisible = !isAborted && isMatchingPopupItem && isMatchingSuffix && isMatchingPrefix

    return isVisible
}

// Checks if the currently selected completion widget item overlaps with the
// proposed completion.
//
// VS Code won't show a completion if it won't.
function completionMatchesPopupItem(
    insertText: string,
    document: vscode.TextDocument,
    context?: vscode.InlineCompletionContext
): boolean {
    if (context?.selectedCompletionInfo) {
        const currentText = document.getText(context.selectedCompletionInfo.range)
        const selectedText = context.selectedCompletionInfo.text

        if (typeof insertText !== 'string') {
            return true
        }

        if (!(currentText + insertText).startsWith(selectedText)) {
            return false
        }
    }
    return true
}

export function completionMatchesSuffix(insertText: string, currentLineSuffix: string): boolean {
    if (typeof insertText !== 'string') {
        return false
    }

    const insertion = insertText
    let j = 0
    for (let i = 0; i < insertion.length; i++) {
        if (insertion[i] === currentLineSuffix[j]) {
            j++
        }
    }
    if (j === currentLineSuffix.length) {
        return true
    }

    return false
}

/**
 * Check that the full completion matches that _latest_ line prefix
 * using the users' current position.
 */
function completionMatchesPrefix(
    insertText: string,
    document: vscode.TextDocument,
    positions: CompletionPositions
): boolean {
    // Derive the proposed completion text using the original position at the point when the request was made.
    const intendedLine = document.lineAt(positions.invokedPosition)
    const intendedCompletion =
        document.getText(intendedLine.range.with({ end: positions.invokedPosition })) + insertText

    const latestLine = document.lineAt(positions.latestPosition)
    const latestPrefix = document.getText(latestLine.range.with({ end: positions.latestPosition }))
    return intendedCompletion.startsWith(latestPrefix)
}
