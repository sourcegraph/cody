import * as vscode from 'vscode'

import {
    type ChatEventSource,
    type ContextItem,
    type ContextMessage,
    type EditModel,
    displayPathBasename,
} from '@sourcegraph/cody-shared'

import { executeEdit } from '../edit/execute'
import type { EditIntent, EditMode } from '../edit/types'
import { logDebug } from '../log'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { countCode } from '../services/utils/code-count'
import { getEditorInsertSpaces, getEditorTabSize } from '../utils'

import { getInput } from '../edit/input/get-input'
import type { AuthProvider } from '../services/AuthProvider'
import { ContentProvider } from './FixupContentStore'
import { FixupDecorator } from './FixupDecorator'
import { FixupDocumentEditObserver } from './FixupDocumentEditObserver'
import type { FixupFile } from './FixupFile'
import { FixupFileObserver } from './FixupFileObserver'
import { FixupScheduler } from './FixupScheduler'
import { FixupTask, type taskID } from './FixupTask'
import { ACTIONABLE_TASK_STATES, CANCELABLE_TASK_STATES } from './codelenses/constants'
import { FixupCodeLenses } from './codelenses/provider'
import { type Diff, computeDiff } from './diff'
import type { FixupFileCollection, FixupIdleTaskRunner, FixupTextChanged } from './roles'
import { CodyTaskState, getMinimumDistanceToRangeBoundary } from './utils'

// This class acts as the factory for Fixup Tasks and handles communication between the Tree View and editor
export class FixupController
    implements FixupFileCollection, FixupIdleTaskRunner, FixupTextChanged, vscode.Disposable
{
    private tasks = new Map<taskID, FixupTask>()
    private readonly files: FixupFileObserver
    private readonly editObserver: FixupDocumentEditObserver
    // TODO: Make the fixup scheduler use a cooldown timer with a longer delay
    private readonly scheduler = new FixupScheduler(10)
    private readonly decorator = new FixupDecorator()
    private readonly codelenses = new FixupCodeLenses(this)
    private readonly contentStore = new ContentProvider()

    private _disposables: vscode.Disposable[] = []

    constructor(private readonly authProvider: AuthProvider) {
        // Register commands
        this._disposables.push(
            vscode.workspace.registerTextDocumentContentProvider('cody-fixup', this.contentStore),
            vscode.commands.registerCommand('cody.fixup.codelens.cancel', id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', {
                    op: 'cancel',
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'cancel')
                return this.cancel(id)
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.diff', id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', {
                    op: 'diff',
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'diff')
                return this.diff(id)
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.retry', async id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', {
                    op: 'regenerate',
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'retry')
                return this.retry(id)
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.undo', id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', {
                    op: 'undo',
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'undo')
                return this.undo(id)
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.accept', id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', {
                    op: 'accept',
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'accept')
                return this.accept(id)
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.error', id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', {
                    op: 'show_error',
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'showError')
                return this.showError(id)
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.skip-formatting', id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', {
                    op: 'skip_formatting',
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'skipFormatting')
                return this.skipFormatting(id)
            }),
            vscode.commands.registerCommand('cody.fixup.cancelNearest', () => {
                const nearestTask = this.getNearestTask({ filter: { states: CANCELABLE_TASK_STATES } })
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
        // Observe file renaming and deletion
        this.files = new FixupFileObserver()
        this._disposables.push(
            vscode.workspace.onDidRenameFiles(this.files.didRenameFiles.bind(this.files))
        )
        this._disposables.push(
            vscode.workspace.onDidDeleteFiles(this.files.didDeleteFiles.bind(this.files))
        )
        // Observe editor focus
        this._disposables.push(
            vscode.window.onDidChangeVisibleTextEditors(this.didChangeVisibleTextEditors.bind(this))
        )
        // Observe file edits
        this.editObserver = new FixupDocumentEditObserver(this)
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument(
                this.editObserver.textDocumentChanged.bind(this.editObserver)
            )
        )

        // Only auto-accept tasks on save if the user doesn't have a conflicting autoSave setting.
        // Otherwise the code lens will just flicker for the user, as it will be accepted almost immediately
        const autoSaveSetting = vscode.workspace.getConfiguration('files').get<string>('autoSave')
        if (autoSaveSetting === 'off' || autoSaveSetting === 'onWindowChange') {
            this._disposables.push(
                vscode.workspace.onDidSaveTextDocument(({ uri }) => {
                    // If we save the document, we consider the user to have accepted any applied tasks.
                    // This helps ensure that the codelens doesn't stay around unnecessarily and become an annoyance.
                    for (const task of this.tasks.values()) {
                        if (task.fixupFile.uri.fsPath.endsWith(uri.fsPath)) {
                            this.accept(task.id)
                        }
                    }
                })
            )
        }
    }

    // FixupFileCollection
    public tasksForFile(file: FixupFile): FixupTask[] {
        return [...this.tasks.values()].filter(task => task.fixupFile === file)
    }

    public maybeFileForUri(uri: vscode.Uri): FixupFile | undefined {
        return this.files.maybeForUri(uri)
    }

    // FixupIdleTaskScheduler

    public scheduleIdle<T>(callback: () => T): Promise<T> {
        return this.scheduler.scheduleIdle(callback)
    }

    public async promptUserForTask(
        document: vscode.TextDocument,
        range: vscode.Range,
        expandedRange: vscode.Range | undefined,
        mode: EditMode,
        model: EditModel,
        intent: EditIntent,
        contextMessages: ContextMessage[],
        source: ChatEventSource
    ): Promise<FixupTask | null> {
        const input = await getInput(
            document,
            this.authProvider,
            {
                initialRange: range,
                initialExpandedRange: expandedRange,
                initialModel: model,
                initialIntent: intent,
            },
            source
        )
        if (!input) {
            return null
        }

        const task = this.createTask(
            document,
            input.instruction,
            input.userContextFiles,
            input.range,
            input.intent,
            mode,
            input.model,
            source,
            contextMessages
        )

        // Return focus to the editor
        void vscode.window.showTextDocument(document)

        return task
    }

    public async createTask(
        document: vscode.TextDocument,
        instruction: string,
        userContextFiles: ContextItem[],
        selectionRange: vscode.Range,
        intent: EditIntent,
        mode: EditMode,
        model: EditModel,
        source?: ChatEventSource,
        contextMessages?: ContextMessage[],
        destinationFile?: vscode.Uri
    ): Promise<FixupTask> {
        const fixupFile = this.files.forUri(document.uri)
        const task = new FixupTask(
            fixupFile,
            instruction,
            userContextFiles,
            intent,
            selectionRange,
            mode,
            model,
            source,
            contextMessages,
            destinationFile
        )
        this.tasks.set(task.id, task)
        const state = task.intent === 'test' ? CodyTaskState.pending : CodyTaskState.working
        this.setTaskState(task, state)
        return task
    }

    // Apply single fixup from task ID. Public for testing.
    public async apply(id: taskID): Promise<void> {
        logDebug('FixupController:apply', 'applying', { verbose: { id } })
        const task = this.tasks.get(id)
        if (!task) {
            return
        }
        await this.applyTask(task)
    }

    // Tries to get a clean, up-to-date diff to apply. If the diff is not
    // up-to-date, it is synchronously recomputed. If the diff is not clean,
    // will return undefined. This may update the task with the newly computed
    // diff.
    private applicableDiffOrRespin(task: FixupTask, document: vscode.TextDocument): Diff | undefined {
        if (task.state !== CodyTaskState.applying && task.state !== CodyTaskState.applied) {
            // We haven't received a response from the LLM yet, so there is
            // no diff.
            console.warn('no response cached from LLM so no applicable diff')
            return undefined
        }
        const bufferText = document.getText(task.selectionRange)
        let diff = task.diff
        if (task.replacement !== undefined && bufferText !== diff?.bufferText) {
            // The buffer changed since we last computed the diff.
            task.diff = diff = computeDiff(
                task.original,
                task.replacement,
                bufferText,
                task.selectionRange.start
            )
            this.didUpdateDiff(task)
        }
        if (!diff?.clean) {
            this.scheduleRespin(task)
            return undefined
        }
        return diff
    }

    // Schedule a re-spin for diffs with conflicts.
    private scheduleRespin(task: FixupTask): void {
        const MAX_SPIN_COUNT_PER_TASK = 5
        if (task.spinCount >= MAX_SPIN_COUNT_PER_TASK) {
            telemetryService.log('CodyVSCodeExtension:fixup:respin', {
                count: task.spinCount,
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.respin', 'scheduled', {
                metadata: { spinCount: task.spinCount },
            })
            this.error(
                task.id,
                new Error(`Cody tried ${task.spinCount} times but failed to edit the file`)
            )
            return
        }
        void vscode.window.showInformationMessage('Cody will rewrite to include your changes')
        this.setTaskState(task, CodyTaskState.working)
    }

    private logTaskCompletion(task: FixupTask, editOk: boolean): void {
        if (!editOk) {
            telemetryService.log('CodyVSCodeExtension:fixup:apply:failed', undefined, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.apply', 'failed')

            // TODO: Try to recover, for example by respinning
            void vscode.window.showWarningMessage('edit did not apply')
            return
        }

        if (!task.replacement) {
            return
        }

        const codeCount = countCode(task.replacement.trim())
        const source = task.source

        telemetryService.log(
            'CodyVSCodeExtension:fixup:applied',
            { ...codeCount, source },
            { hasV2Event: true }
        )
        telemetryRecorder.recordEvent('cody.fixup.apply', 'succeeded', {
            metadata: {
                lineCount: codeCount.lineCount,
                charCount: codeCount.charCount,
            },
            privateMetadata: {
                // TODO: generate numeric ID representing source so that it
                // can be included in metadata for default export.
                source,
            },
        })
    }

    private async streamTask(task: FixupTask, state: 'streaming' | 'complete'): Promise<void> {
        if (task.state !== CodyTaskState.inserting) {
            return
        }

        let edit: vscode.TextEditor['edit'] | vscode.WorkspaceEdit
        let document: vscode.TextDocument

        const visibleEditor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri === task.fixupFile.uri
        )

        if (visibleEditor) {
            document = visibleEditor.document
            edit = visibleEditor.edit.bind(this)
        } else {
            // Perform the edit in the background
            document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
            edit = new vscode.WorkspaceEdit()
        }

        if (state === 'complete') {
            const replacement = task.replacement
            if (replacement === undefined) {
                throw new Error('Task applied with no replacement text')
            }

            // We will format this code once applied, so we do not place an undo stop after this edit to avoid cluttering the undo stack.
            const applyEditOptions = {
                undoStopBefore: false,
                undoStopAfter: false,
            }

            let editOk: boolean
            if (edit instanceof vscode.WorkspaceEdit) {
                edit.replace(document.uri, task.selectionRange, replacement)
                editOk = await vscode.workspace.applyEdit(edit)
            } else {
                editOk = await edit(editBuilder => {
                    editBuilder.replace(task.selectionRange, replacement)
                }, applyEditOptions)
            }

            this.logTaskCompletion(task, editOk)

            // Add the missing undo stop after this change.
            // Now when the user hits 'undo', the entire format and edit will be undone at once
            const formatEditOptions = {
                undoStopBefore: false,
                undoStopAfter: true,
            }
            this.setTaskState(task, CodyTaskState.formatting)
            await new Promise((resolve, reject) => {
                task.formattingResolver = resolve
                this.formatEdit(
                    visibleEditor ? visibleEditor.edit.bind(this) : new vscode.WorkspaceEdit(),
                    document,
                    task,
                    formatEditOptions
                )
                    .then(resolve)
                    .catch(reject)
                    .finally(() => {
                        task.formattingResolver = null
                    })
            })

            // TODO: See if we can discard a FixupFile now.
            this.setTaskState(task, CodyTaskState.applied)

            // Inform the user about the change if it happened in the background
            // TODO: This will show a new notification for each unique file name.
            // Consider only ever showing 1 notification that opens a UI to display all fixups.
            if (!visibleEditor) {
                await this.notifyTaskComplete(task)
            }
            return
        }

        // In progress insertion, apply the partial replacement and adjust the range
        const replacement = task.inProgressReplacement
        if (replacement === undefined) {
            throw new Error('Task applied with no replacement text')
        }

        // Avoid adding any undo stops when streaming. We want the completed edit to be undone as a single unit, once finished.
        const applyEditOptions = {
            undoStopBefore: false,
            undoStopAfter: false,
        }

        // Insert updated text at selection range
        let editOk: boolean
        if (edit instanceof vscode.WorkspaceEdit) {
            edit.replace(document.uri, task.selectionRange, replacement)
            editOk = await vscode.workspace.applyEdit(edit)
        } else {
            editOk = await edit(editBuilder => {
                editBuilder.replace(task.selectionRange, replacement)
            }, applyEditOptions)
        }

        if (editOk) {
            const insertedLines = replacement.split(/\r\n|\r|\n/m).length - 1
            // Expand the selection range to accompany the edit
            task.selectionRange = task.selectionRange.with(
                task.selectionRange.start,
                task.selectionRange.end.translate({
                    lineDelta:
                        task.selectionRange.start.line - task.selectionRange.end.line + insertedLines,
                    characterDelta: insertedLines < 1 ? replacement.length : 0,
                })
            )
        }
    }

    private async applyTask(task: FixupTask): Promise<void> {
        if (task.state !== CodyTaskState.applying) {
            return
        }

        let edit: vscode.TextEditor['edit'] | vscode.WorkspaceEdit
        let document: vscode.TextDocument

        const visibleEditor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri === task.fixupFile.uri
        )

        if (visibleEditor) {
            document = visibleEditor.document
            edit = visibleEditor.edit.bind(this)
        } else {
            // Perform the edit in the background
            document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
            edit = new vscode.WorkspaceEdit()
        }

        // Always ensure that any scheduled diffs have ran before applying edits
        this.updateDiffs()

        // We will format this code once applied, so we avoid placing an undo stop after this edit to avoid cluttering the undo stack.
        const applyEditOptions = { undoStopBefore: true, undoStopAfter: false }

        let editOk: boolean
        if (task.mode === 'edit') {
            const applicableDiff = this.applicableDiffOrRespin(task, document)
            if (!applicableDiff) {
                return
            }
            editOk = await this.replaceEdit(edit, applicableDiff, task, applyEditOptions)
        } else {
            editOk = await this.insertEdit(edit, document, task, applyEditOptions)
        }

        this.logTaskCompletion(task, editOk)

        // Add the missing undo stop after this change.
        // Now when the user hits 'undo', the entire format and edit will be undone at once
        const formatEditOptions = {
            undoStopBefore: false,
            undoStopAfter: true,
        }
        this.setTaskState(task, CodyTaskState.formatting)
        await new Promise((resolve, reject) => {
            task.formattingResolver = resolve
            this.formatEdit(
                visibleEditor ? visibleEditor.edit.bind(this) : new vscode.WorkspaceEdit(),
                document,
                task,
                formatEditOptions
            )
                .then(resolve)
                .catch(reject)
                .finally(() => {
                    task.formattingResolver = null
                })
        })

        // TODO: See if we can discard a FixupFile now.
        this.setTaskState(task, CodyTaskState.applied)

        // Inform the user about the change if it happened in the background
        // TODO: This will show a new notification for each unique file name.
        // Consider only ever showing 1 notification that opens a UI to display all fixups.
        if (!visibleEditor && task.intent !== 'test') {
            await this.notifyTaskComplete(task)
        }
    }

    // Replace edit returned by Cody at task selection range
    private async replaceEdit(
        edit: vscode.TextEditor['edit'] | vscode.WorkspaceEdit,
        diff: Diff,
        task: FixupTask,
        options?: { undoStopBefore: boolean; undoStopAfter: boolean }
    ): Promise<boolean> {
        logDebug('FixupController:edit', 'replacing ')

        if (edit instanceof vscode.WorkspaceEdit) {
            for (const diffEdit of diff.edits) {
                edit.replace(
                    task.fixupFile.uri,
                    new vscode.Range(
                        new vscode.Position(diffEdit.range.start.line, diffEdit.range.start.character),
                        new vscode.Position(diffEdit.range.end.line, diffEdit.range.end.character)
                    ),
                    diffEdit.text
                )
            }
            return vscode.workspace.applyEdit(edit)
        }

        return edit(editBuilder => {
            for (const diffEdit of diff.edits) {
                editBuilder.replace(
                    new vscode.Range(
                        new vscode.Position(diffEdit.range.start.line, diffEdit.range.start.character),
                        new vscode.Position(diffEdit.range.end.line, diffEdit.range.end.character)
                    ),
                    diffEdit.text
                )
            }
        }, options)
    }

    // Insert edit returned by Cody at task selection range
    private async insertEdit(
        edit: vscode.TextEditor['edit'] | vscode.WorkspaceEdit,
        document: vscode.TextDocument,
        task: FixupTask,
        options?: { undoStopBefore: boolean; undoStopAfter: boolean }
    ): Promise<boolean> {
        logDebug('FixupController:edit', 'inserting')
        const text = task.replacement
        const range = task.selectionRange
        if (!text) {
            return false
        }

        // add correct indentation based on first non empty character index
        const nonEmptyStartIndex = document.lineAt(range.start.line).firstNonWhitespaceCharacterIndex
        // add indentation to each line
        const textLines = text.split('\n').map(line => ' '.repeat(nonEmptyStartIndex) + line)
        // join text with new lines, and then remove everything after the last new line if it only contains white spaces
        const replacementText = textLines.join('\n').replace(/[\t ]+$/, '')

        // Insert updated text at selection range
        if (edit instanceof vscode.WorkspaceEdit) {
            edit.insert(document.uri, range.start, replacementText)
            return vscode.workspace.applyEdit(edit)
        }

        return edit(editBuilder => {
            editBuilder.insert(range.start, replacementText)
        }, options)
    }

    private async formatEdit(
        edit: vscode.TextEditor['edit'] | vscode.WorkspaceEdit,
        document: vscode.TextDocument,
        task: FixupTask,
        options?: { undoStopBefore: boolean; undoStopAfter: boolean }
    ): Promise<boolean> {
        const rangeToFormat = task.selectionRange

        if (!rangeToFormat) {
            return false
        }

        const formattingChanges =
            (await vscode.commands.executeCommand<vscode.TextEdit[]>(
                'vscode.executeFormatDocumentProvider',
                document.uri,
                {
                    tabSize: getEditorTabSize(document.uri),
                    insertSpaces: getEditorInsertSpaces(document.uri),
                }
            )) || []

        const formattingChangesInRange = formattingChanges.filter(change =>
            rangeToFormat.contains(change.range)
        )

        if (formattingChangesInRange.length === 0) {
            return false
        }

        logDebug('FixupController:edit', 'formatting')

        if (edit instanceof vscode.WorkspaceEdit) {
            for (const change of formattingChangesInRange) {
                edit.replace(task.fixupFile.uri, change.range, change.newText)
            }
            return vscode.workspace.applyEdit(edit)
        }

        return edit(editBuilder => {
            for (const change of formattingChangesInRange) {
                editBuilder.replace(change.range, change.newText)
            }
        }, options)
    }

    // Notify users of task completion when the edited file is not visible
    private async notifyTaskComplete(task: FixupTask): Promise<void> {
        // Don't show for test mode as the doc will be displayed when done
        if (task.intent === 'test') {
            return
        }
        const showChangesButton = 'Show Changes'
        const result = await vscode.window.showInformationMessage(
            `Edit applied to ${displayPathBasename(task.fixupFile.uri)}`,
            showChangesButton
        )
        if (result === showChangesButton) {
            const editor = await vscode.window.showTextDocument(task.fixupFile.uri)
            editor.revealRange(task.selectionRange)
        }
    }

    private cancel(id: taskID): void {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }
        this.cancelTask(task)
    }

    public cancelTask(task: FixupTask): void {
        this.setTaskState(
            task,
            task.state === CodyTaskState.error ? CodyTaskState.error : CodyTaskState.finished
        )
        this.discard(task)
    }

    private accept(id: taskID): void {
        const task = this.tasks.get(id)
        if (!task || task.state !== CodyTaskState.applied) {
            return
        }
        this.setTaskState(task, CodyTaskState.finished)
        this.discard(task)
    }

    private async undo(id: taskID): Promise<void> {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }
        return this.undoTask(task)
    }

    /**
     * Reverts an applied fixup task by replacing the edited code range with the original code.
     *
     * TODO: It is possible the original code is out of date if the user edited it whilst the fixup was running.
     * Handle this case better. Possibly take a copy of the previous code just before the fixup is applied.
     */
    private async undoTask(task: FixupTask): Promise<void> {
        if (task.state !== CodyTaskState.applied) {
            return
        }

        let editor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri === task.fixupFile.uri
        )
        if (!editor) {
            editor = await vscode.window.showTextDocument(task.fixupFile.uri)
        }

        const replacementText = task.replacement
        if (!replacementText) {
            return
        }

        editor.revealRange(task.selectionRange)
        const editOk = await editor.edit(editBuilder => {
            editBuilder.replace(task.selectionRange, task.original)
        })

        if (!editOk) {
            telemetryService.log('CodyVSCodeExtension:fixup:revert:failed', {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.revert', 'failed')
            return
        }

        const tokenCount = countCode(replacementText)
        telemetryService.log('CodyVSCodeExtension:fixup:reverted', tokenCount, {
            hasV2Event: true,
        })
        telemetryRecorder.recordEvent('cody.fixup.reverted', 'clicked', {
            metadata: tokenCount,
        })

        this.setTaskState(task, CodyTaskState.finished)
    }

    public error(id: taskID, error: Error): void {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }

        task.error = error
        this.setTaskState(task, CodyTaskState.error)
    }

    private showError(id: taskID): void {
        const task = this.tasks.get(id)
        if (!task?.error) {
            return
        }

        void vscode.window.showErrorMessage('Applying Edits Failed', {
            modal: true,
            detail: task.error.message,
        })
    }

    private skipFormatting(id: taskID): void {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }

        if (!task.formattingResolver) {
            return
        }

        task.formattingResolver(false)
    }

    private discard(task: FixupTask): void {
        this.needsDiffUpdate_.delete(task)
        this.codelenses.didDeleteTask(task)
        this.contentStore.delete(task.id)
        this.decorator.didCompleteTask(task)
        this.tasks.delete(task.id)
    }

    public async didReceiveFixupInsertion(
        id: string,
        text: string,
        state: 'streaming' | 'complete'
    ): Promise<void> {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }

        if (task.state !== CodyTaskState.inserting) {
            this.setTaskState(task, CodyTaskState.inserting)
        }

        const trimmedReplacement = state === 'complete' ? text : text.replace(/\n[^\n]*$/, '')
        const replacementText = trimmedReplacement
            .split('\n')
            .map((line, index) =>
                index === 0 ? line : ' '.repeat(task.selectionRange.start.character) + line
            )
            .join('\n')

        if (state === 'complete') {
            task.inProgressReplacement = undefined
            task.replacement = replacementText
            return this.streamTask(task, state)
        }

        if (replacementText === task.inProgressReplacement) {
            // Incoming text has already been applied, do nothing
            return
        }

        task.inProgressReplacement = replacementText
        return this.streamTask(task, state)
    }

    public async didReceiveFixupText(
        id: string,
        text: string,
        state: 'streaming' | 'complete'
    ): Promise<void> {
        const task = this.tasks.get(id)
        if (!task) {
            return Promise.resolve()
        }
        if (task.state !== CodyTaskState.working) {
            // TODO: Update this when we re-spin tasks with conflicts so that
            // we store the new text but can also display something reasonably
            // stable in the editor
            return Promise.resolve()
        }

        switch (state) {
            case 'streaming':
                task.inProgressReplacement = text
                break
            case 'complete':
                task.inProgressReplacement = undefined
                task.replacement = text
                this.setTaskState(task, CodyTaskState.applying)
                break
        }
        this.textDidChange(task)
        return Promise.resolve()
    }

    /**
     * Update the task's fixup file and selection range with the new info,
     * and then task mode to "insert".
     *
     * NOTE: Currently used for /test command only.
     */
    public async didReceiveNewFileRequest(id: string, newFileUri: vscode.Uri): Promise<void> {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }

        if (task.fixupFile.uri.toString() === newFileUri.toString()) {
            return this.setTaskState(task, CodyTaskState.working)
        }

        // append response to new file
        const doc = await vscode.workspace.openTextDocument(newFileUri)
        const pos = new vscode.Position(doc.lineCount - 1, 0)
        const range = new vscode.Range(pos, pos)
        task.selectionRange = range
        task.fixupFile = this.files.replaceFile(task.fixupFile.uri, newFileUri)

        // Set original text to empty as we are not replacing original text but appending to file
        task.original = ''
        task.destinationFile = newFileUri

        // Show the new document before streaming start
        await vscode.window.showTextDocument(doc, {
            selection: range,
            viewColumn: vscode.ViewColumn.Beside,
        })

        // lift the pending state from the task so it can proceed to the next stage
        this.setTaskState(task, CodyTaskState.working)
    }

    // Handles changes to the source document in the fixup selection, or the
    // replacement text generated by Cody.
    public textDidChange(task: FixupTask): void {
        // Do not make any changes when task is in pending
        if (task.state === CodyTaskState.pending) {
            return
        }
        // User has changed an applied task, so we assume the user has accepted the change and wants to take control.
        // This helps ensure that the codelens doesn't stay around unnecessarily and become an annoyance.
        // Note: This will also apply if the user attempts to undo the applied change.
        if (task.state === CodyTaskState.applied) {
            this.accept(task.id)
            return
        }
        if (task.state === CodyTaskState.finished) {
            this.needsDiffUpdate_.delete(task)
        }
        if (this.needsDiffUpdate_.size === 0) {
            void this.scheduler.scheduleIdle(() => this.updateDiffs())
        }
        if (!this.needsDiffUpdate_.has(task)) {
            this.needsDiffUpdate_.add(task)
        }
    }

    // Handles when the range associated with a fixup task changes.
    public rangeDidChange(task: FixupTask): void {
        this.codelenses.didUpdateTask(task)
        // We don't notify the decorator about this range change; vscode
        // updates any text decorations and we can recompute them, lazily,
        // if the diff is dirtied.
    }

    // Tasks where the text of the buffer, or the text provided by Cody, has
    // changed and we need to update diffs.
    private needsDiffUpdate_: Set<FixupTask> = new Set()

    // Files where the editor wasn't visible and we have delayed computing diffs
    // for tasks.
    private needsEditor_: Set<FixupFile> = new Set()

    private didChangeVisibleTextEditors(editors: readonly vscode.TextEditor[]): void {
        const editorsByFile = new Map<FixupFile, vscode.TextEditor[]>()
        for (const editor of editors) {
            const file = this.files.maybeForUri(editor.document.uri)
            if (!file) {
                continue
            }
            // Group editors by file so the decorator can apply decorations
            // in one shot.
            if (!editorsByFile.has(file)) {
                editorsByFile.set(file, [])
            }
            editorsByFile.get(file)?.push(editor)
            // If we were waiting for an editor to get text to diff against,
            // start that process now.
            if (this.needsEditor_.has(file)) {
                this.needsEditor_.delete(file)
                for (const task of this.tasksForFile(file)) {
                    if (this.needsDiffUpdate_.size === 0) {
                        void this.scheduler.scheduleIdle(() => this.updateDiffs())
                    }
                    this.needsDiffUpdate_.add(task)
                }
            }
        }
        // Apply any decorations we have to the visible editors.
        for (const [file, editors] of editorsByFile.entries()) {
            this.decorator.didChangeVisibleTextEditors(file, editors)
        }

        // Update shortcut enablement for visible files
        this.codelenses.updateKeyboardShortcutEnablement([...editorsByFile.keys()])
    }

    private updateDiffs(): void {
        while (this.needsDiffUpdate_.size) {
            const task = this.needsDiffUpdate_.keys().next().value as FixupTask
            this.needsDiffUpdate_.delete(task)
            const editor = vscode.window.visibleTextEditors.find(
                editor => editor.document.uri === task.fixupFile.uri
            )
            if (!editor) {
                this.needsEditor_.add(task.fixupFile)
                continue
            }
            // TODO: When Cody doesn't suggest any output something has gone
            // wrong; we should clean up. But updateDiffs also gets called to
            // process streaming output, so this isn't the place to detect or
            // recover from empty replacements.
            const botText = task.inProgressReplacement || task.replacement
            if (!botText) {
                continue
            }
            const bufferText = editor.document.getText(task.selectionRange)

            // Add new line at the end of bot text when running insert mode
            const newLine = task.mode === 'edit' ? '' : '\n'
            task.diff = computeDiff(
                task.original,
                `${botText}${newLine}`,
                bufferText,
                task.selectionRange.start
            )
            this.didUpdateDiff(task)
        }
    }

    private didUpdateDiff(task: FixupTask): void {
        if (!task.diff) {
            // Once we have a diff, we never go back to not having a diff.
            // If adding that transition, you must un-apply old highlights for
            // this task.
            throw new Error('unreachable')
        }
        this.decorator.didUpdateDiff(task)
        if (!task.diff.clean) {
            // TODO: If this isn't an in-progress diff, then schedule
            // a re-spin or notify failure
            return
        }
    }

    // Show diff between before and after edits
    private async diff(id: taskID): Promise<void> {
        const task = this.tasks.get(id)
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

        // Ensure each diff is fresh so there is no chance of diffing an already diffed file.
        const diffId = `${task.id}-${Date.now()}`
        await this.contentStore.set(diffId, task.fixupFile.uri)
        const tempDocUri = vscode.Uri.parse(`cody-fixup:${task.fixupFile.uri.fsPath}#${diffId}`)
        const doc = await vscode.workspace.openTextDocument(tempDocUri)
        const edit = new vscode.WorkspaceEdit()
        edit.replace(tempDocUri, task.selectionRange, diff.originalText)
        await vscode.workspace.applyEdit(edit)
        await doc.save()

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

    // Regenerate code with the same set of instruction
    public async retry(id: taskID): Promise<void> {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }

        const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
        // Prompt the user for a new instruction, and create a new fixup
        const input = await getInput(
            document,
            this.authProvider,
            {
                initialInputValue: task.instruction,
                initialRange: task.selectionRange,
                initialSelectedContextFiles: task.userContextFiles,
                initialModel: task.model,
                initialIntent: task.intent,
            },
            'code-lens'
        )
        if (!input) {
            return
        }

        /**
         * If the selected range is the same as what we provided, we actually want the original
         * range, which is the range which will be left in the document after the task is undone.
         *
         * Otherwise, use the new selected range.
         */
        const updatedRange = input.range.isEqual(task.selectionRange) ? task.originalRange : input.range

        // Revert and remove the previous task
        await this.undoTask(task)

        void executeEdit({
            configuration: {
                range: updatedRange,
                instruction: input.instruction,
                userContextFiles: input.userContextFiles,
                document,
                intent: input.intent,
                mode: task.mode,
                model: input.model,
            },
            source: 'code-lens',
        })
    }

    private setTaskState(task: FixupTask, state: CodyTaskState): void {
        const oldState = task.state
        if (oldState === state) {
            // Not a transition--nothing to do.
            return
        }

        task.state = state

        // Creates new file if destinationFile is provided at task creation
        if (task.state === CodyTaskState.pending && task.destinationFile) {
            void this.didReceiveNewFileRequest(task.id, task.destinationFile)
            return
        }

        if (oldState !== CodyTaskState.working && task.state === CodyTaskState.working) {
            task.spinCount++
        }

        if (task.state === CodyTaskState.finished) {
            this.discard(task)
            return
        }
        // Save states of the task
        this.codelenses.didUpdateTask(task)

        if (task.state === CodyTaskState.applying) {
            void this.apply(task.id)
        }

        // We currently remove the decorations when the task is applied as they
        // currently do not always show the correct positions for edits.
        // TODO: Improve the diff handling so that decorations more accurately reflect the edits.
        if (task.state === CodyTaskState.applied) {
            this.updateDiffs() // Flush any diff updates first, so they aren't scheduled after the completion.
            this.decorator.didCompleteTask(task)
        }
    }

    private getNearestTask({ filter }: { filter: { states: CodyTaskState[] } }): FixupTask | undefined {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return
        }

        const fixupFile = this.maybeFileForUri(editor.document.uri)
        if (!fixupFile) {
            return
        }

        const position = editor.selection.active

        /**
         * Get the task closest to the current cursor position from the tasks associated with the current file.
         */
        const closestTask = this.tasksForFile(fixupFile)
            .filter(({ state }) => filter.states.includes(state))
            .sort(
                (a, b) =>
                    getMinimumDistanceToRangeBoundary(position, a.selectionRange) -
                    getMinimumDistanceToRangeBoundary(position, b.selectionRange)
            )[0]

        return closestTask
    }

    private reset(): void {
        this.tasks = new Map<taskID, FixupTask>()
    }

    public dispose(): void {
        this.reset()
        this.codelenses.dispose()
        this.decorator.dispose()
        for (const disposable of this._disposables) {
            disposable.dispose()
        }
        this._disposables = []
    }
}
