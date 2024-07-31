import type { FixupFile } from '../../vscode/src/non-stop/FixupFile'
import type { FixupTask, FixupTaskID } from '../../vscode/src/non-stop/FixupTask'
import type { FixupActor, FixupFileCollection } from '../../vscode/src/non-stop/roles'
import type { FixupControlApplicator } from '../../vscode/src/non-stop/strategies'
import { type Agent, errorToCodyError } from './agent'
import type { EditTask } from './protocol-alias'
import * as vscode from 'vscode'
import { TextEdit } from './protocol-alias' // Adjust the import path as needed

// import { TextEdit, ReplaceTextEdit, InsertTextEdit, DeleteTextEdit } from './protocol-alias' // Adjust the import path as needed
// import { Edit } from '../../vscode/src/non-stop/line-diff'
// import {  logError } from '@sourcegraph/cody-shared'

export class AgentFixupControls implements FixupControlApplicator {
    constructor(
        private readonly fixups: FixupActor & FixupFileCollection,
        private readonly notify: typeof Agent.prototype.notify
    ) {}

    public acceptAll(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.acceptAll(task)
        }
    }

    public accept(id: FixupTaskID, range: vscode.Range): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.accept(task, range)
        }
    }

    public reject(id: FixupTaskID, range: vscode.Range ): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.reject(task, range)
        }
    }

    public undo(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.undo(task)
        }
    }

    public cancel(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.cancel(task)
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
        const textEdits: TextEdit[] = [
            {
                type: 'insert',
                position: { line: 0, character: 0 },
                value: 'Arbitrary text edit'
            },
            {
                type: 'delete',
                range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } }
            },
            {
                type: 'replace',
                range: { start: { line: 3, character: 0 }, end: { line: 3, character: 10 } },
                value: 'Replaced text'
            }
        ]
        return {
            id: "TestingIdJM",
            state: task.state,
            error: errorToCodyError(task.error),
            selectionRange: task.selectionRange,
            instruction: task.instruction?.toString().trim(),
            edits: textEdits
        }
    }
}

// function convertEditToTextEdit(edit: Edit): TextEdit {
//     switch (edit.type) {
//         case 'insertion':
//             return {
//                 type: 'insert',
//                 position: edit.range.start,
//                 value: edit.text,
//             } as InsertTextEdit
//         case 'deletion':
//             return {
//                 type: 'delete',
//                 range: edit.range,
//             } as DeleteTextEdit
//         case 'decoratedReplacement':
//             return {
//                 type: 'replace',
//                 range: edit.range,
//                 value: edit.text,
//             } as ReplaceTextEdit
//         default:
//             throw new Error(`Unknown edit type: ${(edit as any).type}`)
//     }
// }
