import * as vscode from 'vscode'

import { type ContextFile } from '@sourcegraph/cody-shared'
import { type ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { type ExecuteEditArguments } from '../edit/execute'
import { type EditIntent } from '../edit/types'
import { getSmartSelection } from '../editor/utils'
import { logDebug } from '../log'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'
import { countCode } from '../services/utils/code-count'
import { getEditorInsertSpaces, getEditorTabSize } from '../utils'

import { computeDiff, type Diff } from './diff'
import { FixupCodeLenses } from './FixupCodeLenses'
import { ContentProvider } from './FixupContentStore'
import { FixupDecorator } from './FixupDecorator'
import { FixupDocumentEditObserver } from './FixupDocumentEditObserver'
import { type FixupFile } from './FixupFile'
import { FixupFileObserver } from './FixupFileObserver'
import { FixupScheduler } from './FixupScheduler'
import { FixupTask, type taskID } from './FixupTask'
import { FixupTypingUI } from './FixupTypingUI'
import {
    type FixupFileCollection,
    type FixupIdleTaskRunner,
    type FixupTaskFactory,
    type FixupTextChanged,
} from './roles'
import { CodyTaskState } from './utils'

// This class acts as the factory for Fixup Tasks and handles communication between the Tree View and editor
export class FixupController
    implements FixupFileCollection, FixupIdleTaskRunner, FixupTaskFactory, FixupTextChanged, vscode.Disposable
{
    private tasks = new Map<taskID, FixupTask>()
    private readonly files: FixupFileObserver
    private readonly editObserver: FixupDocumentEditObserver
    // TODO: Make the fixup scheduler use a cooldown timer with a longer delay
    private readonly scheduler = new FixupScheduler(10)
    private readonly decorator = new FixupDecorator()
    private readonly codelenses = new FixupCodeLenses(this)
    private readonly contentStore = new ContentProvider()
    private readonly typingUI = new FixupTypingUI(this)

    private _disposables: vscode.Disposable[] = []

    constructor() {
        // Register commands
        this._disposables.push(
            vscode.workspace.registerTextDocumentContentProvider('cody-fixup', this.contentStore),
            vscode.commands.registerCommand('cody.fixup.codelens.cancel', id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', { op: 'cancel', hasV2Event: true })
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'cancel')
                return this.cancel(id)
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.diff', id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', { op: 'diff', hasV2Event: true })
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
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', { op: 'undo', hasV2Event: true })
                telemetryRecorder.recordEvent('cody.fixup.codeLens', 'undo')
                return this.undo(id)
            }),
            vscode.commands.registerCommand('cody.fixup.codelens.accept', id => {
                telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', { op: 'accept', hasV2Event: true })
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
            })
        )
        // Observe file renaming and deletion
        this.files = new FixupFileObserver()
        this._disposables.push(vscode.workspace.onDidRenameFiles(this.files.didRenameFiles.bind(this.files)))
        this._disposables.push(vscode.workspace.onDidDeleteFiles(this.files.didDeleteFiles.bind(this.files)))
        // Observe editor focus
        this._disposables.push(vscode.window.onDidChangeVisibleTextEditors(this.didChangeVisibleTextEditors.bind(this)))
        // Observe file edits
        this.editObserver = new FixupDocumentEditObserver(this)
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument(this.editObserver.textDocumentChanged.bind(this.editObserver))
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

    public async promptUserForTask(args: ExecuteEditArguments, source: ChatEventSource): Promise<FixupTask | null> {
        const task = await this.typingUI.show(args, source)
        return task
    }

    public async createTask(
        documentUri: vscode.Uri,
        instruction: string,
        userContextFiles: ContextFile[],
        selectionRange: vscode.Range,
        intent?: EditIntent,
        insertMode?: boolean,
        source?: ChatEventSource
    ): Promise<FixupTask> {
        const fixupFile = this.files.forUri(documentUri)
        // Support expanding the selection range for intents where it is useful
        if (intent !== 'add') {
            selectionRange = await this.getFixupTaskSmartSelection(documentUri, selectionRange)
        }
        const task = new FixupTask(fixupFile, instruction, userContextFiles, intent, selectionRange, insertMode, source)
        this.tasks.set(task.id, task)
        this.setTaskState(task, CodyTaskState.working)
        return task
    }

    // Apply single fixup from task ID. Public for testing.
    public async apply(id: taskID): Promise<void> {
        logDebug('FixupController:apply', 'applying', { verbose: { id } })
        const task = this.tasks.get(id)
        if (!task) {
            console.error('cannot find task')
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
            task.diff = diff = computeDiff(task.original, task.replacement, bufferText, task.selectionRange.start)
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
            telemetryService.log('CodyVSCodeExtension:fixup:respin', { count: task.spinCount, hasV2Event: true })
            telemetryRecorder.recordEvent('cody.fixup.respin', 'scheduled', {
                metadata: { spinCount: task.spinCount },
            })
            return this.error(task.id, new Error(`Cody tried ${task.spinCount} times but failed to edit the file`))
        }
        void vscode.window.showInformationMessage('Cody will rewrite to include your changes')
        this.setTaskState(task, CodyTaskState.working)
        return undefined
    }

    /**
     * This function retrieves a "smart" selection for a FixupTask when selectionRange is not available.
     *
     * The idea of a "smart" selection is to look at both the start and end positions of the current selection,
     * and attempt to expand those positions to encompass more meaningful chunks of code, such as folding regions.
     *
     * The function does the following:
     * 1. Finds the document URI from it's fileName
     * 2. If the selection starts in a folding range, moves the selection start position back to the start of that folding range.
     * 3. If the selection ends in a folding range, moves the selection end positionforward to the end of that folding range.
     * @returns A Promise that resolves to an `vscode.Range` which represents the combined "smart" selection.
     */
    private async getFixupTaskSmartSelection(
        documentUri: vscode.Uri,
        selectionRange: vscode.Range
    ): Promise<vscode.Range> {
        // Use selectionRange when it's available
        if (selectionRange && !selectionRange?.start.isEqual(selectionRange.end)) {
            return selectionRange
        }

        // Retrieve the start position of the current selection
        const activeCursorStartPosition = selectionRange.start
        // If we find a new expanded selection position then we set it as the new start position
        // and if we don't then we fallback to the original selection made by the user
        const newSelectionStartingPosition =
            (await getSmartSelection(documentUri, activeCursorStartPosition.line))?.start || selectionRange.start

        // Retrieve the ending line of the current selection
        const activeCursorEndPosition = selectionRange.end
        // If we find a new expanded selection position then we set it as the new ending position
        // and if we don't then we fallback to the original selection made by the user
        const newSelectionEndingPosition =
            (await getSmartSelection(documentUri, activeCursorEndPosition.line))?.end || selectionRange.end

        // Create a new range that starts from the beginning of the folding range at the start position
        // and ends at the end of the folding range at the end position.
        return new vscode.Range(
            newSelectionStartingPosition.line,
            newSelectionStartingPosition.character,
            newSelectionEndingPosition.line,
            newSelectionEndingPosition.character
        )
    }

    private logTaskCompletion(task: FixupTask, editOk: boolean): void {
        if (!editOk) {
            telemetryService.log('CodyVSCodeExtension:fixup:apply:failed', undefined, { hasV2Event: true })
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

        telemetryService.log('CodyVSCodeExtension:fixup:applied', { ...codeCount, source }, { hasV2Event: true })
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
            const applyEditOptions = { undoStopBefore: false, undoStopAfter: false }

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
            const formatEditOptions = { undoStopBefore: false, undoStopAfter: true }
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
                    .finally(() => (task.formattingResolver = null))
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
        const applyEditOptions = { undoStopBefore: false, undoStopAfter: false }

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
                    lineDelta: task.selectionRange.start.line - task.selectionRange.end.line + insertedLines,
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

        const diff = this.applicableDiffOrRespin(task, document)
        if (!diff) {
            return
        }

        // We will format this code once applied, so we avoid placing an undo stop after this edit to avoid cluttering the undo stack.
        const applyEditOptions = { undoStopBefore: true, undoStopAfter: false }
        const editOk = task.insertMode
            ? await this.insertEdit(edit, document, task, applyEditOptions)
            : await this.replaceEdit(edit, diff, task, applyEditOptions)

        this.logTaskCompletion(task, editOk)

        // Add the missing undo stop after this change.
        // Now when the user hits 'undo', the entire format and edit will be undone at once
        const formatEditOptions = { undoStopBefore: false, undoStopAfter: true }
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
                .finally(() => (task.formattingResolver = null))
        })

        // TODO: See if we can discard a FixupFile now.
        this.setTaskState(task, CodyTaskState.applied)

        // Inform the user about the change if it happened in the background
        // TODO: This will show a new notification for each unique file name.
        // Consider only ever showing 1 notification that opens a UI to display all fixups.
        if (!visibleEditor) {
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

        const formattingChangesInRange = formattingChanges.filter(change => rangeToFormat.contains(change.range))

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

    private async notifyTaskComplete(task: FixupTask): Promise<void> {
        const showChangesButton = 'Show Changes'
        const result = await vscode.window.showInformationMessage(
            `Edit applied to ${task.fixupFile.fileName}`,
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
        return this.cancelTask(task)
    }

    public cancelTask(task: FixupTask): void {
        this.setTaskState(task, task.state === CodyTaskState.error ? CodyTaskState.error : CodyTaskState.finished)
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

        let editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri === task.fixupFile.uri)
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
            telemetryService.log('CodyVSCodeExtension:fixup:revert:failed', { hasV2Event: true })
            telemetryRecorder.recordEvent('cody.fixup.revert', 'failed')
            return
        }

        const tokenCount = countCode(replacementText)
        telemetryService.log('CodyVSCodeExtension:fixup:reverted', tokenCount, { hasV2Event: true })
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

        void vscode.window.showErrorMessage('Applying Edits Failed', { modal: true, detail: task.error.message })
    }

    private skipFormatting(id: taskID): void {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }

        if (!task.formattingResolver) {
            return
        }

        return task.formattingResolver(false)
    }

    private discard(task: FixupTask): void {
        this.needsDiffUpdate_.delete(task)
        this.codelenses.didDeleteTask(task)
        this.contentStore.delete(task.id)
        this.decorator.didCompleteTask(task)
        this.tasks.delete(task.id)
    }

    public async didReceiveFixupInsertion(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
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
            .map((line, index) => (index === 0 ? line : ' '.repeat(task.selectionRange.start.character) + line))
            .join('\n')

        if (state === 'complete') {
            task.inProgressReplacement = undefined
            task.replacement = replacementText
            telemetryService.log('CodyVSCodeExtension:fixupResponse:hasCode', {
                ...countCode(replacementText),
                source: task.source,
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.response', 'hasCode', {
                metadata: countCode(replacementText),
                privateMetadata: {
                    source: task.source,
                },
            })
            return this.streamTask(task, state)
        }

        if (replacementText === task.inProgressReplacement) {
            // Incoming text has already been applied, do nothing
            return
        }

        task.inProgressReplacement = replacementText
        return this.streamTask(task, state)
    }

    public async didReceiveFixupText(id: string, text: string, state: 'streaming' | 'complete'): Promise<void> {
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
                telemetryService.log('CodyVSCodeExtension:fixupResponse:hasCode', {
                    ...countCode(text),
                    source: task.source,
                    hasV2Event: true,
                })
                telemetryRecorder.recordEvent('cody.fixup.response', 'hasCode', {
                    metadata: countCode(text),
                    privateMetadata: {
                        source: task.source,
                    },
                })
                break
        }
        this.textDidChange(task)
        return Promise.resolve()
    }

    // Handles changes to the source document in the fixup selection, or the
    // replacement text generated by Cody.
    public textDidChange(task: FixupTask): void {
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
    }

    private updateDiffs(): void {
        while (this.needsDiffUpdate_.size) {
            const task = this.needsDiffUpdate_.keys().next().value as FixupTask
            this.needsDiffUpdate_.delete(task)
            const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri === task.fixupFile.uri)
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
            const newLine = task.insertMode ? '\n' : ''
            task.diff = computeDiff(task.original, `${botText}${newLine}`, bufferText, task.selectionRange.start)
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
        const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri === task.fixupFile.uri)
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
            'Cody Edit Diff View - ' + task.id,
            {
                preview: true,
                preserveFocus: false,
                selection: task.selectionRange,
                label: 'Cody Edit Diff View',
                description: 'Cody Edit Diff View: ' + task.fixupFile.uri.fsPath,
            }
        )
    }

    // Regenerate code with the same set of instruction
    public async retry(id: taskID): Promise<void> {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }
        const previousRange = task.originalRange
        const previousInstruction = task.instruction
        const previousUserContextFiles = task.userContextFiles
        const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)

        // Prompt the user for a new instruction, and create a new fixup
        const input = await this.typingUI.getInputFromQuickPick({
            filePath: task.fixupFile.filePath,
            range: previousRange,
            initialValue: previousInstruction,
            initialSelectedContextFiles: previousUserContextFiles,
            source: 'code-lens',
        })
        if (!input) {
            return
        }

        // Revert and remove the previous task
        await this.undoTask(task)

        void vscode.commands.executeCommand(
            'cody.command.edit-code',
            {
                range: previousRange,
                instruction: input.instruction,
                userContextFiles: input.userContextFiles,
                document,
                intent: task.intent,
                insertMode: task.insertMode,
            } satisfies ExecuteEditArguments,
            'code-lens'
        )
    }

    private setTaskState(task: FixupTask, state: CodyTaskState): void {
        const oldState = task.state
        if (oldState === state) {
            // Not a transition--nothing to do.
            return
        }

        task.state = state

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
