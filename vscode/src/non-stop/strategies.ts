// FixupController has pluggable strategies for controls and presentation. This
// file defines the interfaces for those strategies.

import type * as vscode from 'vscode'
import type { FixupFile } from './FixupFile'
import type { FixupTask } from './FixupTask'

// An interface for decorating fixup tasks with controls.
export interface FixupControlApplicator extends vscode.Disposable {
    didUpdateTask(task: FixupTask): void
    didDeleteTask(task: FixupTask): void
    // Called when visible files changed.
    // TODO: This API design is gross: this is *not* called when a new task
    // is created in a file that is already visible. It *is* called every time
    // visible files change, so be prepared to handle repeated calls with
    // an empty or unchanged set of files efficiently. Unearth a consistent
    // API here.
    visibleFilesWithTasksMaybeChanged(files: readonly FixupFile[]): void
}
