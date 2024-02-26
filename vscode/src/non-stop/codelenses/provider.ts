import * as vscode from 'vscode'

import type { FixupFile } from '../FixupFile'
import type { FixupTask } from '../FixupTask'
import type { FixupFileCollection } from '../roles'
import { CodyTaskState } from '../utils'
import { ALL_ACTIONABLE_TASK_STATES } from './constants'
import { getLensesForTask } from './items'

export class FixupCodeLenses implements vscode.CodeLensProvider {
    private taskLenses = new Map<FixupTask, vscode.CodeLens[]>()

    private _disposables: vscode.Disposable[] = []
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    /**
     * Create a code lens provider
     */
    constructor(private readonly files: FixupFileCollection) {
        this.provideCodeLenses = this.provideCodeLenses.bind(this)
        this._disposables.push(vscode.languages.registerCodeLensProvider('*', this))
    }

    /**
     * Gets the code lenses for the specified document.
     */
    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const file = this.files.maybeFileForUri(document.uri)
        if (!file) {
            return []
        }
        const lenses = []
        for (const task of this.files.tasksForFile(file)) {
            lenses.push(...(this.taskLenses.get(task) || []))
        }
        return lenses
    }

    public didUpdateTask(task: FixupTask): void {
        this.updateKeyboardShortcutEnablement([task.fixupFile])
        if (task.state === CodyTaskState.finished) {
            this.removeLensesFor(task)
            return
        }
        this.taskLenses.set(task, getLensesForTask(task))
        this.notifyCodeLensesChanged()
    }

    public didDeleteTask(task: FixupTask): void {
        this.updateKeyboardShortcutEnablement([task.fixupFile])
        this.removeLensesFor(task)
    }

    private removeLensesFor(task: FixupTask): void {
        if (this.taskLenses.delete(task)) {
            // TODO: Clean up the fixup file when there are no remaining code lenses
            this.notifyCodeLensesChanged()
        }
    }

    /**
     * For a set of active files, check to see if any tasks within these files are currently actionable.
     * If they are, enable the code lens keyboard shortcuts in the editor.
     */
    public updateKeyboardShortcutEnablement(activeFiles: FixupFile[]): void {
        const allTasks = activeFiles
            .filter(file =>
                vscode.window.visibleTextEditors.some(editor => editor.document.uri === file.uri)
            )
            .flatMap(file => this.files.tasksForFile(file))

        const hasActionableEdit = allTasks.some(task => ALL_ACTIONABLE_TASK_STATES.includes(task.state))
        void vscode.commands.executeCommand('setContext', 'cody.hasActionableEdit', hasActionableEdit)
    }

    private notifyCodeLensesChanged(): void {
        this._onDidChangeCodeLenses.fire()
    }

    /**
     * Dispose the disposables
     */
    public dispose(): void {
        this.taskLenses.clear()
        for (const disposable of this._disposables) {
            disposable.dispose()
        }
        this._disposables = []
    }
}
