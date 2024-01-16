import type * as vscode from 'vscode'

import { type DocumentContext } from './get-current-doc-context'
import { type AutocompleteItem } from './suggested-autocomplete-items-cache'

export function isCompletionVisible(
    completion: AutocompleteItem,
    document: vscode.TextDocument,
    position: vscode.Position,
    docContext: DocumentContext,
    context: vscode.InlineCompletionContext,
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
        : completionMatchesPopupItem(completion, position, document, context)
    const isMatchingSuffix = completionMatchesSuffix(completion, docContext.currentLineSuffix)
    const isVisible = !isAborted && isMatchingPopupItem && isMatchingSuffix

    return isVisible
}

// Checks if the currently selected completion widget item overlaps with the
// proposed completion.
//
// VS Code won't show a completion if it won't.
function completionMatchesPopupItem(
    completion: AutocompleteItem,
    position: vscode.Position,
    document: vscode.TextDocument,
    context: vscode.InlineCompletionContext
): boolean {
    if (context.selectedCompletionInfo) {
        const currentText = document.getText(context.selectedCompletionInfo.range)
        const selectedText = context.selectedCompletionInfo.text

        const insertText = completion.insertText
        if (typeof insertText !== 'string') {
            return true
        }

        // To ensure a good experience, the VS Code insertion might have the range start at the
        // beginning of the line. When this happens, the insertText needs to be adjusted to only
        // contain the insertion after the current position.
        const offset = position.character - (completion.range?.start.character ?? position.character)
        const correctInsertText = insertText.slice(offset)
        if (!(currentText + correctInsertText).startsWith(selectedText)) {
            return false
        }
    }
    return true
}

function completionMatchesSuffix(completion: Pick<AutocompleteItem, 'insertText'>, currentLineSuffix: string): boolean {
    if (typeof completion.insertText !== 'string') {
        return false
    }

    const insertion = completion.insertText
    let j = 0
    // eslint-disable-next-line @typescript-eslint/prefer-for-of
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
