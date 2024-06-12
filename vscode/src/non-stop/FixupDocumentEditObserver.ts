import * as vscode from 'vscode'

import type { FixupActor, FixupFileCollection, FixupTextChanged } from './roles'
import { type TextChange, updateFixedRange, updateRangeMultipleChanges } from './tracked-range'
import { CodyTaskState } from './utils'

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

            for (const edit of event.contentChanges) {
                if (
                    edit.range.end.isBefore(task.selectionRange.start) ||
                    edit.range.start.isAfter(task.selectionRange.end)
                ) {
                    continue
                }
                this.provider_.textDidChange(task)
                break
            }
            const changes = new Array<TextChange>(...event.contentChanges)
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
