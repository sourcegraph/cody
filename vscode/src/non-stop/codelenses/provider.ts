import * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { isRunningInsideAgent } from '../../jsonrpc/isRunningInsideAgent'
import { ContentProvider } from '../FixupContentStore'
import type { FixupFile } from '../FixupFile'
import type { FixupTask, FixupTaskID } from '../FixupTask'
import type { FixupActor, FixupFileCollection } from '../roles'
import { CodyTaskState } from '../state'
import type { FixupControlApplicator } from '../strategies'
import { ACTIONABLE_TASK_STATES, ACTIVE_TASK_STATES, ALL_ACTIONABLE_TASK_STATES } from './constants'
import { getLensesForTask } from './items'

// A FixupControlApplicator which produces code lenses.
export class FixupCodeLenses implements vscode.CodeLensProvider, FixupControlApplicator {
    private taskLenses = new Map<FixupTask, vscode.CodeLens[]>()

    private readonly contentStore = new ContentProvider()
    private _disposables: vscode.Disposable[] = []
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    /**
     * Create a code lens provider
     */
    constructor(private readonly controller: FixupActor & FixupFileCollection) {
        this.provideCodeLenses = this.provideCodeLenses.bind(this)
        this._disposables.push(
            this.contentStore,
            vscode.languages.registerCodeLensProvider('*', this),
            vscode.workspace.registerTextDocumentContentProvider('cody-fixup', this.contentStore),
            vscode.commands.registerCommand('cody.fixup.codelens.cancel', id => {
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'cancel')
                const task = this.controller.taskForId(id)
                if (task) {
                    this.controller.cancel(task)
                }
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.diff', id => {
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'diff')
                return this.diff(id)
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.retry', async id => {
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'retry')
                const task = this.controller.taskForId(id)
                return task ? this.controller.retry(task, 'code-lens') : Promise.resolve()
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.undo', id => {
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'undo')
                const task = this.controller.taskForId(id)
                return task ? this.controller.undo(task) : Promise.resolve()
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.accept', id => {
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'accept')
                const task = this.controller.taskForId(id)
                if (task) {
                    this.controller.accept(task)
                }
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.acceptChange', (id, range) => {
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'acceptChange')
                const task = this.controller.taskForId(id)
                if (task) {
                    this.controller.acceptChange(task, range)
                }
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.rejectChange', (id, range) => {
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'rejectChange')
                const task = this.controller.taskForId(id)
                if (task) {
                    this.controller.rejectChange(task, range)
                }
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.error', id => {
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'showError')
                return this.showError(id)
            }),
            vscode.commands.registerCommand('cody.fixup.cancelNearest', () => {
                const nearestTask = this.getNearestTask({ filter: { states: ACTIVE_TASK_STATES } })
                if (!nearestTask) {
                    return
                }
                return vscode.commands.executeCommand('cody.fixup.codelens.cancel', nearestTask.id)
            }),
            vscode.commands.registerCommand('cody.fixup.acceptNearest', () => {
                const nearestTask = this.getNearestTask({ filter: { states: ACTIONABLE_TASK_STATES } })
                if (!nearestTask) {
                    return
                }
                return vscode.commands.executeCommand('cody.fixup.codelens.accept', nearestTask.id)
            }),
            vscode.commands.registerCommand('cody.fixup.retryNearest', () => {
                const nearestTask = this.getNearestTask({ filter: { states: ACTIONABLE_TASK_STATES } })
                if (!nearestTask) {
                    return
                }
                return vscode.commands.executeCommand('cody.fixup.codelens.retry', nearestTask.id)
            }),
            vscode.commands.registerCommand('cody.fixup.undoNearest', () => {
                const nearestTask = this.getNearestTask({ filter: { states: ACTIONABLE_TASK_STATES } })
                if (!nearestTask) {
                    return
                }
                return vscode.commands.executeCommand('cody.fixup.codelens.undo', nearestTask.id)
            })
        )
    }

    private showError(id: FixupTaskID): void {
        const task = this.controller.taskForId(id)
        if (!task?.error) {
            return
        }

        void vscode.window.showErrorMessage('Applying Edits Failed', {
            modal: true,
            detail: task.error.message,
        })
    }

    private getNearestTask({ filter }: { filter: { states: CodyTaskState[] } }): FixupTask | undefined {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }

        const fixupFile = this.controller.maybeFileForUri(editor.document.uri)
        if (!fixupFile) {
            return
        }

        const position = editor.selection.active
        return this.controller.taskNearPosition(fixupFile, position, filter)
    }

    /**
     * Gets the code lenses for the specified document.
     */
    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const file = this.controller.maybeFileForUri(document.uri)
        if (!file) {
            return []
        }
        const lenses = []
        for (const task of this.controller.tasksForFile(file)) {
            lenses.push(...(this.taskLenses.get(task) || []))
        }
        return lenses
    }

    public didUpdateTask(task: FixupTask): void {
        this.updateKeyboardShortcutEnablement([task.fixupFile])
        if (task.state === CodyTaskState.Finished) {
            this.removeLensesFor(task)
            return
        }
        this.taskLenses.set(task, getLensesForTask(task))
        this.notifyCodeLensesChanged()
    }

    public didDeleteTask(task: FixupTask): void {
        this.updateKeyboardShortcutEnablement([task.fixupFile])
        this.removeLensesFor(task)
        this.contentStore.delete(task.id)
    }

    private removeLensesFor(task: FixupTask): void {
        if (this.taskLenses.delete(task)) {
            // TODO: Clean up the fixup file when there are no remaining code lenses
            this.notifyCodeLensesChanged()
        }
    }

    public visibleFilesWithTasksMaybeChanged(files: readonly FixupFile[]): void {
        // Update shortcut enablement for visible files
        this.updateKeyboardShortcutEnablement(files)
    }

    /**
     * For a set of active files, check to see if any tasks within these files are currently actionable.
     * If they are, enable the code lens keyboard shortcuts in the editor.
     */
    private updateKeyboardShortcutEnablement(activeFiles: readonly FixupFile[]): void {
        const allTasks = activeFiles
            .filter(file =>
                vscode.window.visibleTextEditors.some(editor => editor.document.uri === file.uri)
            )
            .flatMap(file => this.controller.tasksForFile(file))

        const hasActionableEdit = allTasks.some(task => ALL_ACTIONABLE_TASK_STATES.includes(task.state))
        void vscode.commands.executeCommand('setContext', 'cody.hasActionableEdit', hasActionableEdit)
    }

    private notifyCodeLensesChanged(): void {
        this._onDidChangeCodeLenses.fire()
    }

    // Show diff between before and after edits
    private async diff(id: FixupTaskID): Promise<void> {
        const task = this.controller.taskForId(id)
        if (!task) {
            return
        }
        // Get an up-to-date diff
        const editor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri === task.fixupFile.uri
        )
        if (!editor) {
            return
        }
        const diff = task.diff
        if (!diff) {
            return
        }
        // show diff view between the current document and replacement
        // Add replacement content to the temp document

        if (!isRunningInsideAgent()) {
            // Note: For VS Code, we need to accept the task before showing it as a diff here, this is because
            // we have injected empty whitespace and decorations to the document.
            this.controller.accept(task)
        }

        // Ensure each diff is fresh so there is no chance of diffing an already diffed file.
        const diffId = `${task.id}-${Date.now()}`
        await this.contentStore.set(diffId, task.fixupFile.uri)
        const tempDocUri = vscode.Uri.parse(`cody-fixup:${task.fixupFile.uri.fsPath}#${diffId}`)
        const doc = await vscode.workspace.openTextDocument(tempDocUri)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(tempDocUri, task.selectionRange, task.original)
        await vscode.workspace.applyEdit(edit)
        await doc.save()

        // If there is more than one editor group, maximize the current group
        if (vscode.window.tabGroups.all.length > 1) {
            await vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup')
        }

        // Show diff between current document and replacement content
        await vscode.commands.executeCommand(
            'vscode.diff',
            tempDocUri,
            task.fixupFile.uri,
            `Cody Edit Diff View - ${task.id}`,
            {
                preview: true,
                preserveFocus: false,
                label: 'Cody Edit Diff View',
                description: `Cody Edit Diff View: ${task.fixupFile.uri.fsPath}`,
            }
        )
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
