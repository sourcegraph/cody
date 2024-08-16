import type { QuickPickInput } from '../../vscode/src/edit/input/get-input'
import type { FixupFile } from '../../vscode/src/non-stop/FixupFile'
import type { FixupTask, FixupTaskID } from '../../vscode/src/non-stop/FixupTask'
import { FixupCodeLenses } from '../../vscode/src/non-stop/codelenses/provider'
import type { FixupActor, FixupFileCollection } from '../../vscode/src/non-stop/roles'
import { type Agent, errorToCodyError } from './agent'
import type { EditTask } from './protocol-alias'
import { TextEdit, ReplaceTextEdit, InsertTextEdit, DeleteTextEdit } from './protocol-alias' 
import { Edit } from '../../vscode/src/non-stop/line-diff'

export class AgentFixupControls extends FixupCodeLenses {
    constructor(
        private readonly fixups: FixupActor & FixupFileCollection,
        private readonly notify: typeof Agent.prototype.notify
    ) {
        super(fixups)
    }

    public acceptAll(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.acceptAll(task)
        }
    }

    public rejectAll(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.rejectAll(task)
        }
    }

    public cancel(id: FixupTaskID): void {
        const task = this.fixups.taskForId(id)
        if (task) {
            this.fixups.cancel(task)
        }
    }

    public retry(id: FixupTaskID, previousInput: QuickPickInput): Promise<FixupTask | undefined> {
        const task = this.fixups.taskForId(id)
        if (task) {
            return this.fixups.retry(task, 'code-lens', previousInput)
        }
        return Promise.resolve(undefined)
    }

    public getTask(id: FixupTaskID): FixupTask | undefined {
        return this.fixups.taskForId(id)
    }

    didUpdateTask(task: FixupTask): void {
        super.didUpdateTask(task)
        this.notify('editTask/didUpdate', AgentFixupControls.serialize(task))
    }
    didDeleteTask(task: FixupTask): void {
        super.didDeleteTask(task)
        this.notify('editTask/didDelete', AgentFixupControls.serialize(task))
    }

    visibleFilesWithTasksMaybeChanged(files: readonly FixupFile[]): void {}

    dispose() {}


    public static serialize(task: FixupTask): EditTask {

        const textEdits: TextEdit[] = task.diff?.map(edit => convertEditToTextEdit(edit)) || []
    
        return {
            id: task.id,
            state: task.state,
            error: errorToCodyError(task.error),
            selectionRange: task.selectionRange,
            instruction: task.instruction?.toString().trim(),
            edits: textEdits,
            model: task.model.toString().trim(),
            originalText: task.original,
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