import * as vscode from 'vscode'

import type { Edit } from './line-diff'
import type { FixupActor, FixupFileCollection, FixupTextChanged } from './roles'
import { type TextChange, updateFixedRange, updateRangeMultipleChanges } from './tracked-range'
import { CodyTaskState } from './utils'

function updateAppliedDiff(changes: TextChange[], diff: Edit[]): Edit[] {
    const result: Edit[] = []

    for (const edit of diff) {
        const updatedRange = updateRangeMultipleChanges(edit.range, changes)
        if (
            edit.type === 'decoratedReplacement' &&
            (updatedRange.start.character !== 0 || updatedRange.end.character !== 0)
        ) {
            // If the range of a `decoratedReplacement` line no longer encompasses a full line,
            // then we can longer be confident that it should definitely be removed.
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

            const changeWithinRange = event.contentChanges.some(
                edit =>
                    !(
                        edit.range.end.isBefore(task.selectionRange.start) ||
                        edit.range.start.isAfter(task.selectionRange.end)
                    )
            )

            if (changeWithinRange) {
                this.provider_.textDidChange(task)
            }

            const changes = new Array<TextChange>(...event.contentChanges)
            if (task.state === CodyTaskState.Applied && task.diff) {
                task.diff = updateAppliedDiff(changes, task.diff)
            }

            const updatedRange = updateRangeMultipleChanges(task.selectionRange, changes, {
                supportRangeAffix: true,
            })
            if (!updatedRange.isEqual(task.selectionRange)) {
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
