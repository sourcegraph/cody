import * as vscode from 'vscode'

import {
    type ContextItem,
    type EditModel,
    type EventSource,
    type PromptString,
    displayPathBasename,
    getEditorInsertSpaces,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'

import { executeEdit } from '../edit/execute'
import type { EditIntent, EditMode } from '../edit/types'
import { logDebug } from '../log'
import { telemetryService } from '../services/telemetry'
import { splitSafeMetadata } from '../services/telemetry-v2'
import { countCode } from '../services/utils/code-count'

import { PersistenceTracker } from '../common/persistence-tracker'
import { lines } from '../completions/text-processing'
import { getInput } from '../edit/input/get-input'
import type { ExtensionClient } from '../extension-client'
import type { AuthProvider } from '../services/AuthProvider'
import { isInTutorial } from '../tutorial/helpers'
import { FixupDecorator } from './FixupDecorator'
import { FixupDocumentEditObserver } from './FixupDocumentEditObserver'
import type { FixupFile } from './FixupFile'
import { FixupFileObserver } from './FixupFileObserver'
import { FixupScheduler } from './FixupScheduler'
import { FixupTask, type FixupTaskID, type FixupTelemetryMetadata } from './FixupTask'
import { type Diff, computeDiff } from './diff'
import type { FixupActor, FixupFileCollection, FixupIdleTaskRunner, FixupTextChanged } from './roles'
import { CodyTaskState, getMinimumDistanceToRangeBoundary } from './utils'

// This class acts as the factory for Fixup Tasks and handles communication between the Tree View and editor
export class FixupController
    implements FixupActor, FixupFileCollection, FixupIdleTaskRunner, FixupTextChanged, vscode.Disposable
{
    private tasks = new Map<FixupTaskID, FixupTask>()
    private readonly files: FixupFileObserver
    private readonly editObserver: FixupDocumentEditObserver
    // TODO: Make the fixup scheduler use a cooldown timer with a longer delay
    private readonly scheduler = new FixupScheduler(10)
    private readonly decorator = new FixupDecorator()
    private readonly controlApplicator
    private readonly persistenceTracker = new PersistenceTracker(vscode.workspace, {
        onPresent: ({ metadata, ...event }) => {
            const safeMetadata = splitSafeMetadata({ ...event, ...metadata })
            telemetryService.log('CodyVSCodeExtension:fixup:persistence:present', safeMetadata, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.persistence', 'present', safeMetadata)
        },
        onRemoved: ({ metadata, ...event }) => {
            const safeMetadata = splitSafeMetadata({ ...event, ...metadata })
            telemetryService.log('CodyVSCodeExtension:fixup:persistence:present', safeMetadata, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.persistence', 'present', safeMetadata)
        },
    })
    /**
     * The event that fires when the user clicks the undo button on a code lens.
     * Used to help track the Edit rejection rate.
     */
    private readonly undoCommandEvent = new vscode.EventEmitter<FixupTaskID>()

    private _disposables: vscode.Disposable[] = []

    constructor(
        private readonly authProvider: AuthProvider,
        client: ExtensionClient
    ) {
        this.controlApplicator = client.createFixupControlApplicator(this)
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
                            this.accept(task)
                        }
                    }
                })
            )
        }
    }

    // FixupActor

    public accept(task: FixupTask): void {
        if (!task || task.state !== CodyTaskState.Applied) {
            return
        }
        this.setTaskState(task, CodyTaskState.Finished)
        this.discard(task)
    }

    public cancel(task: FixupTask): void {
        this.setTaskState(
            task,
            task.state === CodyTaskState.Error ? CodyTaskState.Error : CodyTaskState.Finished
        )
        this.discard(task)
    }

    /**
     * Reverts an applied fixup task by replacing the edited code range with the original code.
     *
     * TODO: It is possible the original code is out of date if the user edited it whilst the fixup was running.
     * Handle this case better. Possibly take a copy of the previous code just before the fixup is applied.
     */
    public async undo(task: FixupTask): Promise<void> {
        if (task.state !== CodyTaskState.Applied) {
            return
        }

        this.undoCommandEvent.fire(task.id)

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

        // TODO: We should figure out why `editor.edit` often returns `null` instead of a boolean.
        // Please do not remove this `!== false` check without fixing underlying issue, it is necessary for now
        const editOk =
            ((await editor.edit(editBuilder => {
                editBuilder.replace(task.selectionRange, task.original)
            })) as any) !== false

        const legacyMetadata = {
            intent: task.intent,
            mode: task.mode,
            source: task.source,
            ...this.countEditInsertions(task),
            ...task.telemetryMetadata,
        }

        this.setTaskState(task, editOk ? CodyTaskState.Finished : CodyTaskState.Error)

        const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)
        if (!editOk) {
            telemetryService.log('CodyVSCodeExtension:fixup:revert:failed', legacyMetadata, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.revert', 'failed', {
                metadata,
                privateMetadata: {
                    ...privateMetadata,
                    model: task.model,
                },
            })
        } else {
            telemetryService.log('CodyVSCodeExtension:fixup:reverted', legacyMetadata, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.reverted', 'clicked', {
                metadata,
                privateMetadata: {
                    ...privateMetadata,
                    model: task.model,
                },
            })
        }
    }

    // Undo the specified task, then prompt for a new set of instructions near
    // the same region and start a new task.
    public async retry(task: FixupTask, source: EventSource): Promise<FixupTask | undefined> {
        const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
        // Prompt the user for a new instruction, and create a new fixup
        const input = await getInput(
            document,
            this.authProvider,
            {
                initialInputValue: task.instruction,
                initialRange: task.selectionRange,
                initialSelectedContextItems: task.userContextItems,
                initialModel: task.model,
                initialIntent: task.intent,
            },
            source
        )
        if (!input) {
            return
        }

        // If the selected range is the same as what we provided, we actually want the original
        // range, which is the range which will be left in the document after the task is undone.
        // Otherwise, use the new selected range.
        const updatedRange = input.range.isEqual(task.selectionRange) ? task.originalRange : input.range

        // Revert and remove the previous task
        await this.undo(task)

        return executeEdit({
            configuration: {
                range: updatedRange,
                instruction: input.instruction,
                userContextFiles: input.userContextFiles,
                document,
                intent: input.intent,
                mode: task.mode,
                model: input.model,
            },
            source,
        })
    }

    // FixupFileCollection

    public taskForId(id: FixupTaskID): FixupTask | undefined {
        return this.tasks.get(id)
    }

    public tasksForFile(file: FixupFile): FixupTask[] {
        return [...this.tasks.values()].filter(task => task.fixupFile === file)
    }

    public maybeFileForUri(uri: vscode.Uri): FixupFile | undefined {
        return this.files.maybeForUri(uri)
    }

    public taskNearPosition(
        file: FixupFile,
        position: vscode.Position,
        filter: { states: CodyTaskState[] }
    ): FixupTask | undefined {
        const closestTask = this.tasksForFile(file)
            .filter(({ state }) => filter.states.includes(state))
            .sort(
                (a, b) =>
                    getMinimumDistanceToRangeBoundary(position, a.selectionRange) -
                    getMinimumDistanceToRangeBoundary(position, b.selectionRange)
            )[0]

        return closestTask
    }

    // FixupIdleTaskScheduler

    public scheduleIdle<T>(callback: () => T): Promise<T> {
        return this.scheduler.scheduleIdle(callback)
    }

    public async promptUserForTask(
        preInstruction: PromptString | undefined,
        document: vscode.TextDocument,
        range: vscode.Range,
        expandedRange: vscode.Range | undefined,
        mode: EditMode,
        model: EditModel,
        intent: EditIntent,
        source: EventSource,
        telemetryMetadata?: FixupTelemetryMetadata
    ): Promise<FixupTask | null> {
        const input = await getInput(
            document,
            this.authProvider,
            {
                initialRange: range,
                initialExpandedRange: expandedRange,
                initialModel: model,
                initialIntent: intent,
                initialInputValue: preInstruction,
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
            undefined,
            undefined,
            telemetryMetadata
        )

        // Return focus to the editor
        void vscode.window.showTextDocument(document)

        return task
    }

    public async createTask(
        document: vscode.TextDocument,
        instruction: PromptString,
        userContextFiles: ContextItem[],
        selectionRange: vscode.Range,
        intent: EditIntent,
        mode: EditMode,
        model: EditModel,
        source?: EventSource,
        destinationFile?: vscode.Uri,
        insertionPoint?: vscode.Position,
        telemetryMetadata?: FixupTelemetryMetadata
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
            destinationFile,
            insertionPoint,
            telemetryMetadata
        )
        this.tasks.set(task.id, task)
        return task
    }

    /**
     * Starts a Fixup task by moving the task state from "idle" to "working"
     */
    public startTask(task: FixupTask): FixupTask {
        const state = task.intent === 'test' ? CodyTaskState.Pending : CodyTaskState.Working
        this.setTaskState(task, state)
        return task
    }

    // Apply single fixup from task ID. Public for testing.
    public async apply(id: FixupTaskID): Promise<void> {
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
        if (task.state !== CodyTaskState.Applying && task.state !== CodyTaskState.Applied) {
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
            telemetryService.log(
                'CodyVSCodeExtension:fixup:respin',
                {
                    count: task.spinCount,
                },
                {
                    hasV2Event: true,
                }
            )
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
        void vscode.commands.executeCommand('cody.command.start-edit', task)
    }

    private countEditInsertions(task: FixupTask): { lineCount: number; charCount: number } {
        if (!task.replacement) {
            return { lineCount: 0, charCount: 0 }
        }

        if (task.mode === 'insert') {
            return countCode(task.replacement)
        }

        if (!task.diff) {
            return { lineCount: 0, charCount: 0 }
        }

        const countedLines = new Set<number>()
        let charCount = 0
        for (const edit of task.diff.edits) {
            charCount += edit.text.length
            for (let line = edit.range.start.line; line <= edit.range.end.line; line++) {
                countedLines.add(line)
            }
        }

        return { lineCount: countedLines.size, charCount }
    }

    private logTaskCompletion(task: FixupTask, document: vscode.TextDocument, editOk: boolean): void {
        const legacyMetadata = {
            intent: task.intent,
            mode: task.mode,
            source: task.source,
            model: task.model,
            ...this.countEditInsertions(task),
            ...task.telemetryMetadata,
        }
        const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)
        if (!editOk) {
            telemetryService.log('CodyVSCodeExtension:fixup:apply:failed', legacyMetadata, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.apply', 'failed', {
                metadata,
                privateMetadata,
            })

            // TODO: Try to recover, for example by respinning
            void vscode.window.showWarningMessage('edit did not apply')
            return
        }

        if (!task.replacement) {
            return
        }

        telemetryService.log('CodyVSCodeExtension:fixup:applied', legacyMetadata, { hasV2Event: true })
        telemetryRecorder.recordEvent('cody.fixup.apply', 'succeeded', {
            metadata,
            privateMetadata,
        })

        /**
         * Default the tracked range to the `selectionRange`.
         * Note: This is imperfect because an Edit doesn't necessarily change all characters in a `selectionRange`.
         * We should try to chunk actual _changes_ and track these individually.
         * Issue: https://github.com/sourcegraph/cody/issues/3513
         */
        let trackedRange = task.selectionRange

        if (task.mode === 'insert') {
            const insertionPoint = task.insertionPoint || task.selectionRange.start
            const textLines = lines(task.replacement)
            trackedRange = new vscode.Range(
                insertionPoint,
                new vscode.Position(
                    insertionPoint.line + textLines.length - 1,
                    textLines.length > 1
                        ? textLines.at(-1)!.length
                        : insertionPoint.character + textLines[0].length
                )
            )
        }

        this.persistenceTracker.track({
            id: task.id,
            insertedAt: Date.now(),
            insertText: task.replacement,
            insertRange: trackedRange,
            document,
            metadata: legacyMetadata,
        })

        const logAcceptance = (acceptance: 'rejected' | 'accepted') => {
            telemetryService.log(`CodyVSCodeExtension:fixup:user:${acceptance}`, metadata, {
                hasV2Event: true,
            })
            telemetryRecorder.recordEvent('cody.fixup.user', acceptance, {
                metadata,
                privateMetadata,
            })
        }

        /**
         * Tracks when a user clicks "Undo" in the Edit codelens.
         * This is important as VS Code doesn't let us easily differentiate between
         * document changes made by specific commands.
         *
         * This logic ensures we can still mark as task as rejected if a user clicks "Undo".
         */
        const commandUndoListener = this.undoCommandEvent.event(id => {
            if (id !== task.id) {
                return
            }

            // Immediately dispose of the rejectionListener, otherwise this will also run
            // and mark the "Undo" change here as an "acccepted" change made by the user.
            rejectionListener.dispose()
            commandUndoListener.dispose()

            // If a user manually clicked "Undo", we can be confident that they reject the fixup.
            logAcceptance('rejected')
        })
        let undoCount = 0
        /**
         * Tracks the rejection of a Fixup task via the users' next action.
         * As in, if the user immediately undos the change via the system undo command,
         * or if they persist to make new edits to the file.
         *
         * Will listen for changes to the text document and tracks whether the Edit changes were undone or redone.
         * When a change is made, it logs telemetry about whether the change was rejected or accepted.
         */
        const rejectionListener = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.uri !== document.uri || event.contentChanges.length === 0) {
                // Irrelevant change, ignore
                return
            }

            if (event.reason === vscode.TextDocumentChangeReason.Undo) {
                // Set state, but don't fire telemetry yet as the user could still "Redo".
                undoCount += 1
                return
            }

            if (event.reason === vscode.TextDocumentChangeReason.Redo) {
                // User re-did the change, so reset state
                undoCount = Math.max(0, undoCount - 1)
                return
            }

            // User has made a change, we can now fire our stored state as to if the change was undone or not
            logAcceptance(undoCount > 0 ? 'rejected' : 'accepted')

            // We no longer need to track this change, so dispose of our listeners
            rejectionListener.dispose()
            commandUndoListener.dispose()
        })
    }

    private async streamTask(task: FixupTask, state: 'streaming' | 'complete'): Promise<void> {
        if (task.state !== CodyTaskState.Inserting) {
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

            // Add the missing undo stop after this change.
            // Now when the user hits 'undo', the entire format and edit will be undone at once
            const formatEditOptions = {
                undoStopBefore: false,
                undoStopAfter: true,
            }
            this.setTaskState(task, CodyTaskState.Formatting)
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
            this.setTaskState(task, CodyTaskState.Applied)
            this.logTaskCompletion(task, document, editOk)

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
            const updatedRange = task.selectionRange.with(
                task.selectionRange.start,
                task.selectionRange.end.translate({
                    lineDelta:
                        task.selectionRange.start.line - task.selectionRange.end.line + insertedLines,
                    characterDelta: insertedLines < 1 ? replacement.length : 0,
                })
            )
            const documentRange = new vscode.Range(
                document.lineAt(0).range.start,
                document.lineAt(document.lineCount - 1).range.end
            )
            console.log('Streamed edit has been inserted into the document...')
            console.log('The expected range that our edit now covers', updatedRange)
            console.log('Full document range at this point:', documentRange)
            task.selectionRange = updatedRange
        }
    }

    private async applyTask(task: FixupTask): Promise<void> {
        if (task.state !== CodyTaskState.Applying) {
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

        // Add the missing undo stop after this change.
        // Now when the user hits 'undo', the entire format and edit will be undone at once
        const formatEditOptions = {
            undoStopBefore: false,
            undoStopAfter: true,
        }
        this.setTaskState(task, CodyTaskState.Formatting)
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
        this.setTaskState(task, CodyTaskState.Applied)
        this.logTaskCompletion(task, document, editOk)

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
        // If we have specified a dedicated insertion point - use that.
        // Otherwise fall back to using the start of the selection range.
        const insertionPoint = task.insertionPoint || task.selectionRange.start
        if (!text) {
            return false
        }

        // add correct indentation based on first non empty character index
        const nonEmptyStartIndex = document.lineAt(insertionPoint.line).firstNonWhitespaceCharacterIndex
        // add indentation to each line
        const textLines = text.split('\n').map(line => ' '.repeat(nonEmptyStartIndex) + line)
        // join text with new lines, and then remove everything after the last new line if it only contains white spaces
        const replacementText = textLines.join('\n').replace(/[\t ]+$/, '')

        // Insert updated text at selection range
        if (edit instanceof vscode.WorkspaceEdit) {
            edit.insert(document.uri, insertionPoint, replacementText)
            return vscode.workspace.applyEdit(edit)
        }

        return edit(editBuilder => {
            editBuilder.insert(insertionPoint, replacementText)
        }, options)
    }

    private async formatEdit(
        edit: vscode.TextEditor['edit'] | vscode.WorkspaceEdit,
        document: vscode.TextDocument,
        task: FixupTask,
        options?: { undoStopBefore: boolean; undoStopAfter: boolean }
    ): Promise<boolean> {
        if (isInTutorial(document)) {
            // Skip formatting in tutorial files,
            // This is an additional enhancement that doesn't add much value to the tutorial
            // and makes the tutorial UX more error-prone
            return false
        }

        // Expand the range to include full lines to reduce the likelihood of formatting issues
        const rangeToFormat = new vscode.Range(
            task.selectionRange.start.line,
            0,
            task.selectionRange.end.line,
            Number.MAX_VALUE
        )

        if (!rangeToFormat) {
            return false
        }

        const formattingChanges =
            (await vscode.commands.executeCommand<vscode.TextEdit[]>(
                'vscode.executeFormatDocumentProvider',
                document.uri,
                {
                    tabSize: document.uri,
                    insertSpaces: getEditorInsertSpaces(document.uri, vscode.workspace, vscode.window),
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

    public error(id: FixupTaskID, error: Error): void {
        const task = this.tasks.get(id)
        if (!task) {
            return
        }

        task.error = error
        this.setTaskState(task, CodyTaskState.Error)
    }

    private discard(task: FixupTask): void {
        this.needsDiffUpdate_.delete(task)
        this.controlApplicator.didDeleteTask(task)
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

        if (task.state !== CodyTaskState.Inserting) {
            this.setTaskState(task, CodyTaskState.Inserting)
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
        if (task.state !== CodyTaskState.Working) {
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
                this.setTaskState(task, CodyTaskState.Applying)
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
            return this.setTaskState(task, CodyTaskState.Working)
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
        this.setTaskState(task, CodyTaskState.Working)
    }

    // Handles changes to the source document in the fixup selection, or the
    // replacement text generated by Cody.
    public textDidChange(task: FixupTask): void {
        // Do not make any changes when task is in pending
        if (task.state === CodyTaskState.Pending) {
            return
        }
        // User has changed an applied task, so we assume the user has accepted the change and wants to take control.
        // This helps ensure that the codelens doesn't stay around unnecessarily and become an annoyance.
        // Note: This will also apply if the user attempts to undo the applied change.
        if (task.state === CodyTaskState.Applied) {
            this.accept(task)
            return
        }
        if (task.state === CodyTaskState.Finished) {
            this.needsDiffUpdate_.delete(task)
        }
        if (this.needsDiffUpdate_.size === 0) {
            void this.scheduler.scheduleIdle(() => this.updateDiffs())
        }
        if (task.mode === 'edit' && !this.needsDiffUpdate_.has(task)) {
            this.needsDiffUpdate_.add(task)
        }
    }

    // Handles when the range associated with a fixup task changes.
    public rangeDidChange(task: FixupTask): void {
        this.controlApplicator.didUpdateTask(task)
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

        this.controlApplicator.visibleFilesWithTasksMaybeChanged([...editorsByFile.keys()])
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

    private setTaskState(task: FixupTask, state: CodyTaskState): void {
        const oldState = task.state
        if (oldState === state) {
            // Not a transition--nothing to do.
            return
        }

        task.state = state

        if (oldState !== CodyTaskState.Working && task.state === CodyTaskState.Working) {
            task.spinCount++
        }

        if (task.state === CodyTaskState.Finished) {
            this.discard(task)
            return
        }
        // Save states of the task
        this.controlApplicator.didUpdateTask(task)

        if (task.state === CodyTaskState.Applying) {
            void this.apply(task.id)
        }

        // We currently remove the decorations when the task is applied as they
        // currently do not always show the correct positions for edits.
        // TODO: Improve the diff handling so that decorations more accurately reflect the edits.
        if (task.state === CodyTaskState.Applied) {
            this.updateDiffs() // Flush any diff updates first, so they aren't scheduled after the completion.
            this.decorator.didCompleteTask(task)
        }
    }

    private reset(): void {
        this.tasks = new Map<FixupTaskID, FixupTask>()
    }

    public dispose(): void {
        this.reset()
        this.controlApplicator.dispose()
        this.decorator.dispose()
        for (const disposable of this._disposables) {
            disposable.dispose()
        }
        this._disposables = []
    }
}
