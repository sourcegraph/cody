import type * as vscode from 'vscode'

import type { EventSource } from '@sourcegraph/cody-shared'
import type { QuickPickInput } from '../edit/input/get-input'
import type { FixupFile } from './FixupFile'
import type { FixupTask, FixupTaskID } from './FixupTask'
import type { CodyTaskState } from './state'

// Role interfaces so that sub-objects of the FixupController can consume a
// narrow part of the controller.

/**
 * Operations on FixupTasks.
 */
export interface FixupActor {
    /**
     * Mark all changes in a task as accepted and stop tracking the task. Only applicable to
     * tasks in the "applied" state. Sets the task state to "finished" and
     * discards the task.
     */
    accept(task: FixupTask): void

    /**
     * Mark an individual part of a diff within a task as accepted.
     * Only applicable to tasks in the "applied" state.
     */
    acceptChange(task: FixupTask, range: vscode.Range): Promise<void>

    /**
     * Mark an individual part of a diff within a task as rejected.
     * Only applicable to tasks in the "applied" state.
     */
    rejectChange(task: FixupTask, range: vscode.Range): Promise<void>

    /**
     * Undo a task's edits and stop tracking the task. Only applicable to
     * tasks in the "applied" state. If the undo succeeds, the task state is
     * set to "finished" and the task is discarded.
     */
    undo(task: FixupTask): Promise<void>

    /**
     * Cancel a task. Sets the task state to "error" or "finished" and stops
     * tracking the task. Tasks in any state can be cancelled.
     */
    cancel(task: FixupTask): void

    /**
     * Undo the task (see `undo`), prompt for updated instructions, and start
     * a new task to try again. Only applicable to tasks in the "applied" state.
     * @param task the task to retry.
     * @param source the source of the retry, for event logging.
     * @param previousInput the previous input, if any.
     */
    retry(
        task: FixupTask,
        source: EventSource,
        previousInput?: QuickPickInput
    ): Promise<FixupTask | undefined>
}

/**
 * Provides access to a list of fixup tasks.
 */
export interface FixupFileCollection {
    taskForId(id: FixupTaskID): FixupTask | undefined
    tasksForFile(file: FixupFile): FixupTask[]

    /**
     * Gets the closest fixup task in the given file.
     * @param file the FixupFile to search for tasks.
     * @param position the position in the file to search from.
     * @param filter only return tasks in one of the given states.
     */
    taskNearPosition(
        file: FixupFile,
        position: vscode.Position,
        filter: { states: readonly CodyTaskState[] }
    ): FixupTask | undefined

    /**
     * If there is a FixupFile for the specified URI, return it, otherwise
     * undefined. VScode callbacks which have a document or URI can use this
     * to determine if there may be interest in the URI.
     * @param uri the URI of the document of interest.
     */
    maybeFileForUri(uri: vscode.Uri): FixupFile | undefined
}

/**
 * Sink for notifications that text related to the fixup task--either the text
 * in the file, or the text provided by Cody--has changed.
 */
export interface FixupTextChanged {
    textDidChange(task: FixupTask): void
    rangeDidChange(task: FixupTask): void
}
