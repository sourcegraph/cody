import type { FixupFile } from '../../vscode/src/non-stop/FixupFile'
import type { FixupTask, FixupTaskID } from '../../vscode/src/non-stop/FixupTask'
import type { FixupActor, FixupFileCollection } from '../../vscode/src/non-stop/roles'
import type { FixupControlApplicator } from '../../vscode/src/non-stop/strategies'
import { type Agent, errorToCodyError } from './agent'
import type { EditTask } from './protocol-alias'
import * as vscode from 'vscode'
import { TextEdit, ReplaceTextEdit, InsertTextEdit, DeleteTextEdit } from './protocol-alias' 
import { Edit } from '../../vscode/src/non-stop/line-diff'

export class AgentFixupControls implements FixupControlApplicator {
    constructor(
        private readonly fixups: FixupActor & FixupFileCollection,
        private readonly notify: typeof Agent.prototype.notify
    ) {}

    public acceptAll(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            console.warn("JM: calling fixups.acceptAll")
            this.fixups.acceptAll(task)
        } else {
            console.warn("JM: task not found for id", id)
        }
    }

    public accept(id: FixupTaskID, range: vscode.Range): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            console.warn("JM: calling fixups.accept for range", range)
            this.fixups.accept(task, range)
        } else {
            console.warn("JM: task not found for id", id)
        }
    }

    public reject(id: FixupTaskID, range: vscode.Range ): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            console.warn("JM: calling fixups.reject for range", range)
            this.fixups.reject(task, range)
        } else {
            console.warn("JM: task not found for id", id)
        }
    }

    public undo(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            console.warn("JM: calling fixups.undo")
            this.fixups.undo(task)
        } else {
            console.warn("JM: task not found for id", id)
        }
    }

    public cancel(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.cancel(task)
        } else {
            console.warn("JM: task not found for id", id)
        }
    }

    // FixupControlApplicator

    didUpdateTask(task: FixupTask): void {
        this.notify('editTask/didUpdate', AgentFixupControls.serialize(task))
    }
    didDeleteTask(task: FixupTask): void {
        this.notify('editTask/didDelete', AgentFixupControls.serialize(task))
    }

    visibleFilesWithTasksMaybeChanged(files: readonly FixupFile[]): void {}

    dispose() {}

    public static serialize(task: FixupTask): EditTask {
        console.warn("JM: In serialize")

        const textEdits: TextEdit[] = task.diff?.map(edit => convertEditToTextEdit(edit)) || []

        return {
            id: task.id,
            state: task.state,
            error: errorToCodyError(task.error),
            selectionRange: task.selectionRange,
            instruction: task.instruction?.toString().trim(),
            edits: textEdits
        }
    }
}

function convertEditToTextEdit(edit: Edit): TextEdit {
    switch (edit.type) {
        case 'insertion':
            return {
                type: 'insert',
                position: edit.range.start,
                value: edit.text,
            } as InsertTextEdit
        case 'deletion':
            return {
                type: 'delete',
                range: edit.range,
            } as DeleteTextEdit
        case 'decoratedReplacement':
            return {
                type: 'replace',
                range: edit.range,
                value: edit.text,
            } as ReplaceTextEdit
        default:
            throw new Error(`Unknown edit type: ${(edit as any).type}`)
    }
}
