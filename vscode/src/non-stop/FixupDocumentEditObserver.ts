import * as vscode from 'vscode'

import { isStreamedIntent } from '../edit/utils/edit-intent'
import type { Edit } from './line-diff'
import type { FixupActor, FixupFileCollection, FixupTextChanged } from './roles'
import { CodyTaskState } from './state'
import { type TextChange, updateFixedRange, updateRangeMultipleChanges } from './tracked-range'

/**
 * Determines of a range, even if it uses different positions, exactly matches
 * the dimensions of another range.
 *
 * This is used to determine if a range has materially changed in terms of content, rather than just position.
 * This is useful information as it tells us if a user modified the range in some way.
 */
function matchesRangeDimensions(originalRange: vscode.Range, incomingRange: vscode.Range): boolean {
    const originalLength = originalRange.end.line - originalRange.start.line
    const incomingLength = incomingRange.end.line - incomingRange.start.line
    if (originalLength !== incomingLength) {
        // Range shifted vertically
        return false
    }

    if (
        originalRange.start.character !== incomingRange.start.character ||
        originalRange.end.character !== incomingRange.end.character
    ) {
        // Range shifted horizontally
        return false
    }

    return true
}

function updateAppliedDiff(changes: TextChange[], diff: Edit[]): Edit[] {
    const result: Edit[] = []

    for (const edit of diff) {
        const updatedRange = updateRangeMultipleChanges(edit.range, changes)
        if (
            edit.type === 'decoratedReplacement' &&
            // Check if the dimensions of the replacement are unchanged, this tells us if the replacement
            // line was modified in any way. If it has, we must discard this as we cannot reliably delete it later.
            !matchesRangeDimensions(edit.range, updatedRange)
        ) {
            // We can longer be confident that it should definitely be removed.
            // It may now contain new code that the user does not want to be discarded.
            //
            // Instead, we will discard this edit from the diff. This has some implications:
            // 1. We no longer show a decoration for this line, so the previous `oldText` will no longer show.
            // 2. We will not delete this line when the task is accepted.
            continue
        }
        edit.range = updatedRange
        result.push(edit)
    }

    return result
}

/**
 * Observes text document changes and updates the regions with active fixups.
 * Notifies the fixup controller when text being edited by a fixup changes.
 * Fixups must track ranges of interest within documents that are being worked
 * on. Ranges of interest include the region of text we sent to the LLM, and the
 * and the decorations indicating where edits will appear.
 */
export class FixupDocumentEditObserver {
    constructor(private readonly provider_: FixupFileCollection & FixupTextChanged & FixupActor) {}

    public textDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
        const file = this.provider_.maybeFileForUri(event.document.uri)
        if (!file) {
            return
        }
        const tasks = this.provider_.tasksForFile(file)
        // Notify which tasks have changed text or the range edits apply to
        for (const task of tasks) {
            // Cancel any ongoing `add` tasks on undo.
            // This is to avoid a scenario where a user is trying to undo a specific part of text, but cannot because the streamed text continues to come in as the latest addition.
            if (
                task.state === CodyTaskState.Inserting &&
                event.reason === vscode.TextDocumentChangeReason.Undo
            ) {
                this.provider_.cancel(task)
                continue
            }

            const changes = new Array<TextChange>(...event.contentChanges)
            if (task.state === CodyTaskState.Applied && task.diff) {
                task.diff = updateAppliedDiff(changes, task.diff)
            }

            const changeWithinRange = changes.some(
                edit =>
                    !(
                        edit.range.end.isBefore(task.selectionRange.start) ||
                        edit.range.start.isAfter(task.selectionRange.end)
                    )
            )
            if (changeWithinRange) {
                this.provider_.textDidChange(task)
            }

            const updatedRange = updateRangeMultipleChanges(task.selectionRange, changes, {
                supportRangeAffix: true,
            })

            /**
             * Currently `updateRangeMultipleChanges` will collapse a range (it will be empty)
             * if the entire contents of the range are replaced. This happens regularly for streamed
             * insertions as we replace the full range with the latest LLM response as we receive it.
             *
             * TODO: Instead of collapsing the range, `updateRangeMultipleChanges` should expand to match
             * the new contents.
             */
            const isCollapsedInsertion = isStreamedIntent(task.intent) && updatedRange.isEmpty

            if (!isCollapsedInsertion && !updatedRange.isEqual(task.selectionRange)) {
                task.selectionRange = updatedRange
                this.provider_.rangeDidChange(task)
            }

            if (task.insertionPoint) {
                const updatedInsertionPoint = updateRangeMultipleChanges(
                    new vscode.Range(task.insertionPoint, task.insertionPoint),
                    changes,
                    { supportRangeAffix: true }
                ).start
                if (!updatedInsertionPoint.isEqual(task.insertionPoint)) {
                    task.insertionPoint = updatedInsertionPoint
                }
            }

            // We keep track of where the original range should be, so we can re-use it for retries.
            // Note: This range doesn't expand or shrink, it needs to match the original range as applied to `task.original`
            const updatedFixedRange = updateRangeMultipleChanges(
                task.originalRange,
                changes,
                {},
                updateFixedRange
            )
            if (!updatedFixedRange.isEqual(task.originalRange)) {
                task.originalRange = updatedFixedRange
            }
        }
    }
}
