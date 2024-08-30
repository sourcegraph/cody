import * as vscode from 'vscode'

import {
    type ContextItem,
    type EditModel,
    type EventSource,
    type PromptString,
    displayPathBasename,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'

import { executeEdit } from '../edit/execute'
import {
    type EditIntent,
    EditIntentTelemetryMetadataMapping,
    type EditMode,
    EditModeTelemetryMetadataMapping,
} from '../edit/types'
import { logDebug } from '../log'
import { splitSafeMetadata } from '../services/telemetry-v2'
import { countCode } from '../services/utils/code-count'

import {
    DEFAULT_EVENT_SOURCE,
    EventSourceTelemetryMetadataMapping,
} from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import type { SmartApplyResult } from '../chat/protocol'
import { PersistenceTracker } from '../common/persistence-tracker'
import { lines } from '../completions/text-processing'
import { type QuickPickInput, getInput } from '../edit/input/get-input'
import { isStreamedIntent } from '../edit/utils/edit-intent'
import { getOverridenModelForIntent } from '../edit/utils/edit-models'
import type { ExtensionClient } from '../extension-client'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import { authProvider } from '../services/AuthProvider'
import { FixupDocumentEditObserver } from './FixupDocumentEditObserver'
import type { FixupFile } from './FixupFile'
import { FixupFileObserver } from './FixupFileObserver'
import { FixupTask, type FixupTaskID, type FixupTelemetryMetadata } from './FixupTask'
import { TERMINAL_EDIT_STATES } from './codelenses/constants'
import { FixupDecorator } from './decorations/FixupDecorator'
import { type Edit, computeDiff, makeDiffEditBuilderCompatible } from './line-diff'
import { trackRejection } from './rejection-tracker'
import type { FixupActor, FixupFileCollection, FixupTextChanged } from './roles'
import { CodyTaskState } from './state'
import { expandRangeToInsertedText, getMinimumDistanceToRangeBoundary } from './utils'

// This class acts as the factory for Fixup Tasks and handles communication between the Tree View and editor
export class FixupController
    implements FixupActor, FixupFileCollection, FixupTextChanged, vscode.Disposable
{
    private tasks = new Map<FixupTaskID, FixupTask>()
    private readonly files: FixupFileObserver
    private readonly editObserver: FixupDocumentEditObserver
    private readonly decorator = new FixupDecorator()
    private readonly controlApplicator
    private readonly persistenceTracker = new PersistenceTracker(vscode.workspace, {
        onPresent: ({ metadata, ...event }) => {
            const safeMetadata = splitSafeMetadata({ ...event, ...metadata })
            telemetryRecorder.recordEvent('cody.fixup.persistence', 'present', safeMetadata)
        },
        onRemoved: ({ metadata, ...event }) => {
            const safeMetadata = splitSafeMetadata({ ...event, ...metadata })
            telemetryRecorder.recordEvent('cody.fixup.persistence', 'present', safeMetadata)
        },
    })
    /**
     * The event that fires when the user clicks the undo button on a code lens.
     * Used to help track the Edit rejection rate.
     */
    private readonly undoCommandEvent = new vscode.EventEmitter<FixupTaskID>()

    private _disposables: vscode.Disposable[] = []

    constructor(private readonly client: ExtensionClient) {
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
                // Note: It is important to use `onWillSaveTextDocument` rather than `onDidSaveTextDocument`
                // here. This is to ensure we run `accept` before any formatting logic runs. In some cases
                // we modify the document on accept (remove placeholder lines), so doing this alongside formatting
                // logic could remove more lines than intended from the document
                vscode.workspace.onWillSaveTextDocument(event => {
                    if (event.reason !== vscode.TextDocumentSaveReason.Manual) {
                        // Not a manual save, do not accept any tasks
                        return
                    }

                    // If we save the document, we consider the user to have accepted any applied tasks.
                    // This helps ensure that the codelens doesn't stay around unnecessarily and become an annoyance
                    const tasksToAccept = [...this.tasks.values()].filter(task =>
                        task.fixupFile.uri.fsPath.endsWith(event.document.uri.fsPath)
                    )

                    // Use waitUntil to ensure that we clear the placeholder lines before any post-save
                    // actions (like formatting) happen.
                    event.waitUntil(this.getPlaceholderInsertionsToDelete(tasksToAccept))

                    for (const task of tasksToAccept) {
                        // Finally accept all of the tasks
                        this.accept(task)
                    }
                })
            )
        }
    }

    // FixupActor

    public async acceptChange(task: FixupTask, range: vscode.Range): Promise<void> {
        const affectedChanges = task.diff?.filter(edit => range.contains(edit.range))
        const editor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.toString() === task.fixupFile.uri.toString()
        )
        if (!affectedChanges || !editor) {
            return
        }

        for (const change of affectedChanges) {
            if (change.type === 'decoratedReplacement') {
                // Accepting a deletion, we must delete the placeholder lines
                await editor.edit(
                    editBuilder => {
                        editBuilder.delete(change.range)
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )
            }

            // Remove the edit from the task's diff
            task.removeDiffChangeByRange(change.range)
        }

        // Update the decorations
        this.decorator.didApplyTask(task)

        // If all blocks are accepted, mark the task as finished
        if (!task.diff || task.diff.length === 0) {
            this.accept(task)
        }

        this.refreshCodeLenses(task)
        this.controlApplicator.didUpdateTask(task)
    }

    public async rejectChange(task: FixupTask, range: vscode.Range): Promise<void> {
        const affectedChanges = task.diff?.filter(edit => range.contains(edit.range))
        const editor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri.toString() === task.fixupFile.uri.toString()
        )
        if (!affectedChanges || !editor) {
            return
        }

        for (const change of affectedChanges) {
            if (change.type === 'decoratedReplacement') {
                // Rejecting a deletion, we must restore the oldText
                await editor.edit(
                    editBuilder => {
                        editBuilder.replace(
                            change.range,
                            change.oldText + '\n' // The oldText does not include the line break, so re-add it here
                        )
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )
            } else if (change.type === 'insertion') {
                // Rejecting an insertion, we must delete the added lines
                await editor.edit(
                    editBuilder => {
                        editBuilder.delete(change.range)
                    },
                    { undoStopAfter: false, undoStopBefore: false }
                )
            }

            // Remove the edit from the task's diff
            task.removeDiffChangeByRange(change.range)
        }

        // Update the decorations
        this.decorator.didApplyTask(task)

        this.refreshCodeLenses(task)
        this.controlApplicator.didUpdateTask(task)
    }

    private refreshCodeLenses(task: FixupTask): void {
        // Trigger a refresh of the code lenses
        vscode.commands.executeCommand('vscode.executeCodeLensProvider', task.document.uri)
    }

    public accept(task: FixupTask): void {
        if (!task || task.state !== CodyTaskState.Applied) {
            return
        }
        this.setTaskState(task, CodyTaskState.Finished)
    }

    private async acceptOverlappingTasks(primaryTask: FixupTask): Promise<void> {
        const tasksForFile = [...this.tasks.values()].filter(
            task => primaryTask.fixupFile.uri.toString === task.fixupFile.uri.toString
        )
        for (const task of tasksForFile) {
            if (
                task.state === CodyTaskState.Applied &&
                task.selectionRange.intersection(primaryTask.selectionRange) !== undefined
            ) {
                await this.clearPlaceholderInsertions([task], task.fixupFile.uri)
                this.accept(task)
            }
        }
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

        editor.revealRange(task.selectionRange)
        task.diff = undefined
        const editOk = await this.revertToOriginal(task, editor.edit)

        const legacyMetadata = {
            intent: EditIntentTelemetryMetadataMapping[task.intent] || task.intent,
            mode: EditModeTelemetryMetadataMapping[task.mode] || task.mode,
            source:
                EventSourceTelemetryMetadataMapping[task.source || DEFAULT_EVENT_SOURCE] || task.source,
            ...this.countEditInsertions(task),
            ...task.telemetryMetadata,
        }

        this.setTaskState(task, editOk ? CodyTaskState.Finished : CodyTaskState.Error)

        const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)
        if (!editOk) {
            telemetryRecorder.recordEvent('cody.fixup.revert', 'failed', {
                metadata,
                privateMetadata: {
                    ...privateMetadata,
                    model: task.model,
                },
            })
        } else {
            telemetryRecorder.recordEvent('cody.fixup.reverted', 'clicked', {
                metadata,
                privateMetadata: {
                    ...privateMetadata,
                    model: task.model,
                },
            })
        }
    }

    /**
     * Given a task, tracks upcoming changes in the associated document.
     * If the change restores an applied task to its original state, we discard the task
     * meaning any associated UI and behaviour is updated.
     */
    public registerDiscardOnRestoreListener(task: FixupTask): void {
        const listener: vscode.Disposable = vscode.workspace.onDidChangeTextDocument(async event => {
            if (task.state !== CodyTaskState.Applied) {
                // Task is not in the applied state, this is likely due to it
                // being accepted or discarded in an alternative way.
                // Dispose of this listener as we no longer need it
                return listener.dispose()
            }

            if (event.document.uri.toString() !== task.fixupFile.uri.toString()) {
                // Irrelevant change, ignore (edit applied to different file)
                return
            }

            const changeIsWithinRange = event.contentChanges.some(
                edit =>
                    !(
                        edit.range.end.isBefore(task.selectionRange.start) ||
                        edit.range.start.isAfter(task.selectionRange.end)
                    )
            )
            if (!changeIsWithinRange) {
                // Irrelevant change, ignore (edit applied outside of task range)
                return
            }

            if (event.document.getText(task.selectionRange) === task.original) {
                // The user has undone the edit, discard the task
                task.diff = undefined
                this.setTaskState(task, CodyTaskState.Finished)
                return listener.dispose()
            }
        })
    }

    private async revertToOriginal(
        task: FixupTask,
        edit: vscode.TextEditor['edit'] | vscode.WorkspaceEdit,
        options?: { undoStopBefore: boolean; undoStopAfter: boolean }
    ): Promise<boolean> {
        let editOk: boolean
        if (edit instanceof vscode.WorkspaceEdit) {
            edit.replace(task.fixupFile.uri, task.selectionRange, task.original)
            editOk = await vscode.workspace.applyEdit(edit)
        } else {
            editOk = await edit(editBuilder => {
                editBuilder.replace(task.selectionRange, task.original)
            }, options)
        }

        if (editOk) {
            task.selectionRange = task.originalRange
        }

        return editOk
    }

    // Undo the specified task, then prompt for a new set of instructions near
    // the same region and start a new task.
    public async retry(
        task: FixupTask,
        source: EventSource,
        previousInput?: QuickPickInput
    ): Promise<FixupTask | undefined> {
        const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
        // Prompt the user for a new instruction, and create a new fixup
        const input =
            previousInput ??
            (await getInput(
                document,
                {
                    initialInputValue: task.instruction,
                    initialRange: task.selectionRange,
                    initialSelectedContextItems: task.userContextItems,
                    initialModel: task.model,
                    initialIntent: task.intent,
                },
                source
            ))
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
                mode: input.mode,
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
            input.mode,
            input.model,
            source,
            undefined,
            undefined,
            telemetryMetadata
        )

        // Return focus to the editor
        const editor = await vscode.window.showTextDocument(document)

        // Collapse selection to cursor position
        const cursor = editor.selection.active
        editor.selection = new vscode.Selection(cursor, cursor)

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
        telemetryMetadata?: FixupTelemetryMetadata,
        taskId?: FixupTaskID
    ): Promise<FixupTask> {
        const authStatus = authProvider.instance!.getAuthStatus()
        const overridenModel = getOverridenModelForIntent(intent, model, authStatus)
        const fixupFile = this.files.forUri(document.uri)
        const task = new FixupTask(
            fixupFile,
            document,
            instruction,
            userContextFiles,
            intent,
            selectionRange,
            mode,
            overridenModel,
            source,
            destinationFile,
            insertionPoint,
            telemetryMetadata,
            taskId
        )
        this.tasks.set(task.id, task)
        this.decorator.didCreateTask(task)
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

    /**
     * Computes a new diff against the latest text of a FixupTask.
     */
    private applicableDiffOrRespin(task: FixupTask, document: vscode.TextDocument): Edit[] | undefined {
        if (task.state !== CodyTaskState.Applying && task.state !== CodyTaskState.Applied) {
            // We haven't received a response from the LLM yet, so there is
            // no diff.
            console.warn('no response cached from LLM so no applicable diff')
            return undefined
        }

        // Update the original text, so we're always computing a diff against the latest
        // code in the editor.
        task.original = document.getText(task.selectionRange)
        task.diff = computeDiff(task.replacement || '', task.original, task.selectionRange, {
            decorateDeletions: !isRunningInsideAgent(),
        })
        return task.diff
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
        for (const edit of task.diff) {
            if (edit.type !== 'insertion') {
                continue
            }
            charCount += edit.text.length
            for (let line = edit.range.start.line; line <= edit.range.end.line; line++) {
                countedLines.add(line)
            }
        }

        return { lineCount: countedLines.size, charCount }
    }

    private logTaskCompletion(task: FixupTask, document: vscode.TextDocument, editOk: boolean): void {
        const legacyMetadata = {
            intent: EditIntentTelemetryMetadataMapping[task.intent] || task.intent,
            mode: EditModeTelemetryMetadataMapping[task.mode] || task.mode,
            source:
                EventSourceTelemetryMetadataMapping[task.source || DEFAULT_EVENT_SOURCE] || task.source,
            model: task.model,
            ...this.countEditInsertions(task),
            ...task.telemetryMetadata,
        }
        const { metadata, privateMetadata } = splitSafeMetadata(legacyMetadata)
        if (!editOk) {
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
            const textLines = lines(task.replacement)
            trackedRange = new vscode.Range(
                task.insertionPoint,
                new vscode.Position(
                    task.insertionPoint.line + textLines.length - 1,
                    textLines.length > 1
                        ? textLines.at(-1)!.length
                        : task.insertionPoint.character + textLines[0].length
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
            telemetryRecorder.recordEvent('cody.fixup.user', acceptance, {
                metadata,
                privateMetadata,
            })
        }

        trackRejection(
            document,
            vscode.workspace,
            {
                onAccepted: () => logAcceptance('accepted'),
                onRejected: () => logAcceptance('rejected'),
            },
            {
                id: task.id,
                intent: task.intent,
                undoEvent: this.undoCommandEvent,
            }
        )
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

            const applyEditOptions = {
                undoStopBefore: false,
                undoStopAfter: true,
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
            // Expand the selection range to accompany the edit
            task.selectionRange = expandRangeToInsertedText(task.selectionRange, replacement)
        }

        // Streamed tasks are applied as they are received, so we must call this after each edit is applied,
        // as well as when the edit finally reaches the "applied" state - when the LLM is finished
        this.decorator.didApplyTask(task)
    }

    private async applyTask(task: FixupTask): Promise<void> {
        if (task.state !== CodyTaskState.Applying) {
            return
        }

        // Before applying this task, we should auto-accept any other tasks
        // that have an overlapping range. This is so we don't end up in a scenario
        // where we have two overlapping diffs shown in the document.
        await this.acceptOverlappingTasks(task)

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

        if (!editOk) {
            console.warn('Could not apply FixupTask: ', task.id)
            return
        }

        // Update the replacement to match the applied edit.
        // This is as the diff doesn't necessarily match the LLM response, as we may apply additional
        // changes (e.g. injectiong placeholder lines)
        // This ensures decorations are correctly computed.
        task.replacement = document.getText(task.selectionRange)
        this.decorator.didApplyTask(task)

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
        diff: Edit[],
        task: FixupTask,
        options?: { undoStopBefore: boolean; undoStopAfter: boolean }
    ): Promise<boolean> {
        logDebug('FixupController:edit', 'replacing ')
        const suitableDiffForEditing = makeDiffEditBuilderCompatible(diff)

        if (edit instanceof vscode.WorkspaceEdit) {
            for (const change of suitableDiffForEditing) {
                if (change.type === 'deletion') {
                    edit.delete(task.fixupFile.uri, change.range)
                } else if (change.type === 'decoratedReplacement') {
                    edit.replace(task.fixupFile.uri, change.range, change.text)
                } else {
                    edit.insert(task.fixupFile.uri, change.range.start, change.text)
                }
            }
            return vscode.workspace.applyEdit(edit)
        }

        return edit(editBuilder => {
            for (const change of suitableDiffForEditing) {
                if (change.type === 'deletion') {
                    editBuilder.delete(change.range)
                } else if (change.type === 'decoratedReplacement') {
                    editBuilder.replace(change.range, change.text)
                } else {
                    editBuilder.insert(change.range.start, change.text)
                }
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
        if (!text) {
            return false
        }

        // Get the index of the first non-whitespace character on the line where the insertion point is.
        const nonEmptyStartIndex = document.lineAt(
            task.insertionPoint.line
        ).firstNonWhitespaceCharacterIndex
        // Split the text into lines and prepend each line with spaces to match the indentation level
        // of the line where the insertion point is.
        const textLines = text.split('\n').map(line => ' '.repeat(nonEmptyStartIndex) + line)
        // Join the lines back into a single string with newline characters
        // Remove any leading whitespace from the first line, as we are inserting at the insertionPoint
        // Keep any trailing whitespace on the last line to preserve the original indentation.
        const replacementText = textLines.join('\n').trimStart()

        // Insert the updated text at the specified insertionPoint.
        if (edit instanceof vscode.WorkspaceEdit) {
            edit.insert(document.uri, task.insertionPoint, replacementText)
            return vscode.workspace.applyEdit(edit)
        }

        return edit(editBuilder => {
            editBuilder.insert(task.insertionPoint, replacementText)
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
        this.clearPlaceholderInsertions([task], task.fixupFile.uri)
        this.controlApplicator.didDeleteTask(task)
        this.decorator.didCompleteTask(task)
        this.tasks.delete(task.id)
    }

    private async getPlaceholderInsertionsToDelete(tasks: FixupTask[]): Promise<vscode.TextEdit[]> {
        const rangesToDelete: vscode.TextEdit[] = []
        for (const task of tasks) {
            const decoratedReplacements = (task.diff || [])
                .filter(({ type }) => type === 'decoratedReplacement')
                .map(({ range }) => new vscode.TextEdit(range, ''))
            rangesToDelete.push(...decoratedReplacements)
            // Clear the diff afterwards, we want to ensure we never duplicate removing placeholder lines
            task.diff = undefined
        }
        return rangesToDelete
    }

    private async clearPlaceholderInsertions(tasks: FixupTask[], uri: vscode.Uri): Promise<void> {
        const placeholderLines = await this.getPlaceholderInsertionsToDelete(tasks)
        if (placeholderLines.length === 0) {
            // Nothing to clear
            return
        }

        let edit: vscode.TextEditor['edit'] | vscode.WorkspaceEdit
        let document: vscode.TextDocument

        const visibleEditor = vscode.window.visibleTextEditors.find(
            editor => editor.document.uri === uri
        )

        if (visibleEditor) {
            document = visibleEditor.document
            edit = visibleEditor.edit.bind(this)
        } else {
            // Perform the edit in the background
            document = await vscode.workspace.openTextDocument(uri)
            edit = new vscode.WorkspaceEdit()
        }

        if (edit instanceof vscode.WorkspaceEdit) {
            for (const line of placeholderLines) {
                edit.delete(document.uri, line.range)
            }
            await vscode.workspace.applyEdit(edit)
        } else {
            await edit(
                editBuilder => {
                    for (const line of placeholderLines) {
                        editBuilder.delete(line.range)
                    }
                },
                { undoStopAfter: false, undoStopBefore: false }
            )
        }
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
                this.decorator.didUpdateInProgressTask(task)
                break
            case 'complete':
                task.inProgressReplacement = undefined
                task.replacement = text
                this.setTaskState(task, CodyTaskState.Applying)
                break
        }
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
        const doc = await this.client.openNewDocument(vscode.workspace, newFileUri)
        if (!doc) {
            throw new Error(`Cannot create file for the fixup: ${newFileUri.toString()}`)
        }

        const pos = new vscode.Position(Math.max(doc.lineCount - 1, 0), 0)
        const range = new vscode.Range(pos, pos)
        task.selectionRange = range
        task.insertionPoint = range.start
        task.fixupFile = this.files.replaceFile(task.fixupFile.uri, doc.uri)

        // Set original text to empty as we are not replacing original text but appending to file
        task.original = ''
        task.destinationFile = doc.uri

        // Show the new document before streaming start
        await vscode.window.showTextDocument(doc, {
            selection: range,
            viewColumn: vscode.ViewColumn.Beside,
        })

        // lift the pending state from the task so it can proceed to the next stage
        this.setTaskState(task, CodyTaskState.Working)
    }

    // Handles changes to the source document in the fixup selection
    public textDidChange(task: FixupTask): void {
        if (task.state === CodyTaskState.Applied && task.mode === 'insert') {
            // For insertion tasks we accept as soon as the user makes a change
            // within the task range. This is a case where the user is more likely to want
            // to keep in the flow of writing their code, and would not benefit from editing
            // the "diff".
            this.accept(task)
            return
        }

        if (isStreamedIntent(task.intent)) {
            // Text change is most likely coming from the incoming streamed insertions,
            // No need to update the decorator here as it'll cause a flicker.
            return
        }

        if (task.state === CodyTaskState.Working) {
            this.decorator.didUpdateInProgressTask(task)
        } else if (task.state === CodyTaskState.Applied) {
            this.decorator.didApplyTask(task)
        }
    }

    // Handles when the range associated with a fixup task changes.
    public rangeDidChange(task: FixupTask): void {
        this.controlApplicator.didUpdateTask(task)
        // We don't notify the decorator about this range change; vscode
        // updates any text decorations and we can recompute them, lazily,
        // if the diff is dirtied.
    }

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
        }
        // Apply any decorations we have to the visible editors.
        for (const file of editorsByFile.keys()) {
            this.decorator.didChangeVisibleTextEditors(file)
        }

        this.controlApplicator.visibleFilesWithTasksMaybeChanged([...editorsByFile.keys()])
    }

    private async notifyChatTaskState(task: FixupTask): Promise<void> {
        if (!TERMINAL_EDIT_STATES.includes(task.state)) {
            // We only update chat when a task reaches a terminal state.
            return
        }

        await vscode.commands.executeCommand('cody.command.markSmartApplyApplied', {
            taskId: task.id,
            taskState: task.state,
        } satisfies SmartApplyResult)
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

        if (task.source === 'chat') {
            // This task was created through a chat message (smart apply).
            // We need to notify the chat that the task has changed.
            this.notifyChatTaskState(task)
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

        if (task.state === CodyTaskState.Applied) {
            this.decorator.didApplyTask(task)
            this.registerDiscardOnRestoreListener(task)
        }
    }

    private reset(): void {
        this.tasks = new Map<FixupTaskID, FixupTask>()
    }

    public dispose(): void {
        this.reset()
        this.controlApplicator.dispose()
        for (const disposable of this._disposables) {
            disposable.dispose()
        }
        this._disposables = []
    }
}
