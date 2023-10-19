import * as vscode from 'vscode'

import { FixupIntent, FixupIntentClassification } from '@sourcegraph/cody-shared/src/chat/recipes/fixup'
import { VsCodeFixupController, VsCodeFixupTaskRecipeData } from '@sourcegraph/cody-shared/src/editor'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { MAX_CURRENT_FILE_TOKENS } from '@sourcegraph/cody-shared/src/prompt/constants'
import { truncateText } from '@sourcegraph/cody-shared/src/prompt/truncation'

import { getSmartSelection } from '../editor/utils'
import { logDebug } from '../log'
import { countCode } from '../services/InlineAssist'
import { telemetryService } from '../services/telemetry'

import { computeDiff, Diff } from './diff'
import { FixupCodeLenses } from './FixupCodeLenses'
import { ContentProvider } from './FixupContentStore'
import { FixupDecorator } from './FixupDecorator'
import { FixupDocumentEditObserver } from './FixupDocumentEditObserver'
import { FixupFile } from './FixupFile'
import { FixupFileObserver } from './FixupFileObserver'
import { FixupScheduler } from './FixupScheduler'
import { FixupTask, taskID } from './FixupTask'
import { FixupTypingUI } from './FixupTypingUI'
import { FixupFileCollection, FixupIdleTaskRunner, FixupTaskFactory, FixupTextChanged } from './roles'
import { FixupTaskTreeItem, TaskViewProvider } from './TaskViewProvider'
import { CodyTaskState } from './utils'

// This class acts as the factory for Fixup Tasks and handles communication between the Tree View and editor
export class FixupController
    implements
        VsCodeFixupController,
        FixupFileCollection,
        FixupIdleTaskRunner,
        FixupTaskFactory,
        FixupTextChanged,
        vscode.Disposable
{
    private tasks = new Map<taskID, FixupTask>()
    private readonly taskViewProvider: TaskViewProvider
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
            vscode.commands.registerCommand('cody.fixup.open', id => this.showThisFixup(id)),
            vscode.commands.registerCommand('cody.fixup.apply', treeItem => this.applyFixups(treeItem)),
            vscode.commands.registerCommand('cody.fixup.apply-by-file', treeItem => this.applyFixups(treeItem)),
            vscode.commands.registerCommand('cody.fixup.apply-all', () => this.applyFixups()),
            vscode.commands.registerCommand('cody.fixup.diff', treeItem => this.showDiff(treeItem)),
            vscode.commands.registerCommand('cody.fixup.codelens.cancel', id => this.cancel(id)),
            vscode.commands.registerCommand('cody.fixup.codelens.diff', id => this.diff(id)),
            vscode.commands.registerCommand('cody.fixup.codelens.undo', id => this.undo(id)),
            vscode.commands.registerCommand('cody.fixup.codelens.accept', id => this.accept(id)),
            vscode.commands.registerCommand('cody.fixup.codelens.cancel', id => this.cancel(id)),
            vscode.commands.registerCommand('cody.fixup.codelens.regenerate', async id => this.regenerate(id))
        )
        // Observe file renaming and deletion
        this.files = new FixupFileObserver()
        this._disposables.push(vscode.workspace.onDidRenameFiles(this.files.didRenameFiles.bind(this.files)))
        this._disposables.push(vscode.workspace.onDidDeleteFiles(this.files.didDeleteFiles.bind(this.files)))
        // Observe editor focus
        this._disposables.push(vscode.window.onDidChangeVisibleTextEditors(this.didChangeVisibleTextEditors.bind(this)))
        // Start the fixup tree view provider
        this.taskViewProvider = new TaskViewProvider()
        // Observe file edits
        this.editObserver = new FixupDocumentEditObserver(this)
        this._disposables.push(
            vscode.workspace.onDidChangeTextDocument(this.editObserver.textDocumentChanged.bind(this.editObserver))
        )
    }

    /**
     * Register the tree view that provides an additional UI for Fixups.
     * Call this if the feature is enabled.
     * TODO: We should move this to a QuickPick and enable it by default.
     */
    public registerTreeView(): void {
        this._disposables.push(vscode.window.registerTreeDataProvider('cody.fixup.tree.view', this.taskViewProvider))
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

    public async promptUserForTask(): Promise<FixupTask | null> {
        const task = await this.typingUI.show()
        return task
    }

    public createTask(
        document: vscode.TextDocument,
        instruction: string,
        selectionRange: vscode.Range,
        insertMode?: boolean,
        source?: string
    ): FixupTask {
        const fixupFile = this.files.forUri(document.uri)
        // Create selection lines as Map<number, string>
        const selectionLines = document
            .getText(selectionRange)
            .split('\n')
            .reduce((acc, lineContent, index) => {
                const lineNumber = selectionRange.start.line + index
                acc.set(lineNumber, lineContent)
                return acc
            }, new Map())

        const task = new FixupTask(fixupFile, instruction, selectionRange, selectionLines, insertMode, source)
        this.tasks.set(task.id, task)
        this.setTaskState(task, CodyTaskState.working)
        return task
    }

    // Open fsPath at the selected line in editor on tree item click
    private showThisFixup(taskID: taskID): void {
        const task = this.tasks.get(taskID)
        if (!task) {
            void vscode.window.showInformationMessage('No fixup was found...')
            return
        }
        // Create vscode Uri from task uri and selection range
        void vscode.window.showTextDocument(task.fixupFile.uri, { selection: task.selectionRange })
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

    private updateTaskDiff(task: FixupTask, bufferText: string): Diff | undefined {
        if (task.replacement !== undefined) {
            task.diff = computeDiff(task.original, task.replacement, bufferText, task.selectionRange.start)
            this.didUpdateDiff(task)
        }

        return task.diff
    }

    // Schedule a re-spin for diffs with conflicts.
    private scheduleRespin(task: FixupTask): void {
        const MAX_SPIN_COUNT_PER_TASK = 5
        if (task.spinCount >= MAX_SPIN_COUNT_PER_TASK) {
            telemetryService.log('CodyVSCodeExtension:fixup:respin', { count: task.spinCount })
            // TODO: Report an error message
            // task.error = `Cody tried ${task.spinCount} times but failed to edit the file`
            this.setTaskState(task, CodyTaskState.error)
            return
        }
        void vscode.window.showInformationMessage('Cody will rewrite to include your changes')
        this.setTaskState(task, CodyTaskState.working)
        return undefined
    }

    /**
     * Retrieves the intent for a specific task based on the selected text and other contextual information.
     *
     * @param taskId - The ID of the task for which the intent is to be determined.
     * @param intentDetector - The detector used to classify the intent from available options.
     *
     * @returns A promise that resolves to a `FixupIntent` which can be one of the intents like 'add', 'edit', etc.
     *
     * @throws
     * - Will throw an error if no code is selected for fixup.
     * - Will throw an error if the selected text exceeds the defined maximum limit.
     *
     * @todo (umpox): Explore shorter and more efficient ways to detect intent.
     * Possible methods:
     * - Input -> Match first word against update|fix|add|delete verbs
     * - Context -> Infer intent from context, e.g. Current file is a test -> Test intent, Current selection is a comment symbol -> Documentation intent
     */
    public async getTaskIntent(taskId: string, intentDetector: IntentDetector): Promise<FixupIntent> {
        const task = this.tasks.get(taskId)
        if (!task) {
            throw new Error('Select some code to fixup.')
        }
        const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
        const selectedText = document.getText(task.selectionRange)
        if (truncateText(selectedText, MAX_CURRENT_FILE_TOKENS) !== selectedText) {
            const msg = "The amount of text selected exceeds Cody's current capacity."
            throw new Error(msg)
        }

        if (selectedText.trim().length === 0) {
            // Nothing selected, assume this is always 'add'.
            return 'add'
        }

        const intent = await intentDetector.classifyIntentFromOptions(
            task.instruction,
            FixupIntentClassification,
            'edit'
        )
        return intent
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
     *
     * @returns A Promise that resolves to an `vscode.Range` which represents the combined "smart" selection.
     */
    private async getFixupTaskSmartSelection(task: FixupTask, selectionRange: vscode.Range): Promise<vscode.Range> {
        const fileName = task.fixupFile.uri.fsPath
        const documentUri = vscode.Uri.file(fileName)

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

    private async applyTask(task: FixupTask): Promise<void> {
        if (task.state !== CodyTaskState.applying) {
            return
        }

        let editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri === task.fixupFile.uri)
        if (!editor) {
            editor = await vscode.window.showTextDocument(task.fixupFile.uri)
        }

        const diff = this.applicableDiffOrRespin(task, editor.document)
        if (!diff) {
            return
        }

        editor.revealRange(task.selectionRange)

        const editOk = task.insertMode ? await this.insertEdit(editor, task) : await this.replaceEdit(editor, diff)

        if (!editOk) {
            telemetryService.log('CodyVSCodeExtension:fixup:apply:failed')
            // TODO: Try to recover, for example by respinning
            void vscode.window.showWarningMessage('edit did not apply')
            return
        }

        const replacementText = task.replacement
        if (replacementText) {
            const codeCount = countCode(replacementText)
            const source = task.source
            telemetryService.log('CodyVSCodeExtension:fixup:applied', { ...codeCount, source })
        }

        // TODO: See if we can discard a FixupFile now.
        this.setTaskState(task, CodyTaskState.applied)
        this.updateTaskDiff(task, editor.document.getText(task.selectionRange))
    }

    // Replace edit returned by Cody at task selection range
    private async replaceEdit(editor: vscode.TextEditor, diff: Diff): Promise<boolean> {
        logDebug('FixupController:edit', 'replacing ')
        const editOk = await editor.edit(editBuilder => {
            for (const edit of diff.edits) {
                editBuilder.replace(
                    new vscode.Range(
                        new vscode.Position(edit.range.start.line, edit.range.start.character),
                        new vscode.Position(edit.range.end.line, edit.range.end.character)
                    ),
                    edit.text
                )
            }
        })
        return editOk
    }

    // Insert edit returned by Cody at task selection range
    private async insertEdit(editor: vscode.TextEditor, task: FixupTask): Promise<boolean> {
        logDebug('FixupController:edit', 'inserting')
        const text = task.replacement
        const range = task.selectionRange
        if (!text) {
            return false
        }

        // add correct indentation based on first non empty character index
        const nonEmptyStartIndex = editor.document.lineAt(range.start.line).firstNonWhitespaceCharacterIndex
        // add indentation to each line
        const textLines = text.split('\n').map(line => ' '.repeat(nonEmptyStartIndex) + line)
        // join text with new lines, and then remove everything after the last new line if it only contains white spaces
        const replacementText = textLines.join('\n').replace(/[\t ]+$/, '')
        // Insert updated text at selection range
        const editOk = await editor.edit(editBuilder => {
            editBuilder.insert(range.start, replacementText)
        })
        return editOk
    }

    // Applying fixups from tree item click
    private async applyFixups(treeItem?: FixupTaskTreeItem): Promise<void> {
        // TODO: Add support for applying all fixups
        // applying fixup to all tasks
        if (!treeItem) {
            void vscode.window.showInformationMessage(
                'Applying all fixups is not implemented yet...',
                String(this.tasks.size)
            )
            return
        }
        // applying fixup to a single task
        if (treeItem.contextValue === 'task' && treeItem.id) {
            await this.apply(treeItem.id)
            return
        }
        // TODO: Add support for applying fixups from a directory
        // applying fixup to all tasks in a directory
        if (treeItem.contextValue === 'fsPath') {
            for (const task of this.tasks.values()) {
                void vscode.window.showInformationMessage(
                    'Applying fixups from a directory is not implemented yet...',
                    String(this.tasks.size)
                )
                if (task.fixupFile.uri.fsPath.endsWith(treeItem.fsPath)) {
                    return
                }
            }
            return
        }
        console.error('cannot apply fixups')
    }

    private cancel(id: taskID): void {
        telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', { op: 'cancel' })
        const task = this.tasks.get(id)
        if (!task) {
            return
        }
        this.setTaskState(task, task.state === CodyTaskState.error ? CodyTaskState.error : CodyTaskState.finished)
        this.discard(task)
    }

    private accept(id: taskID): void {
        telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', { op: 'accept' })
        const task = this.tasks.get(id)
        if (!task) {
            return
        }
        this.setTaskState(task, CodyTaskState.finished)
        this.discard(task)
    }

    private undo(id: taskID): void {
        telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', { op: 'undo' })
        const task = this.tasks.get(id)
        if (!task) {
            return
        }
        console.log('TODO: Finish UNDO logic')
    }

    private discard(task: FixupTask): void {
        this.needsDiffUpdate_.delete(task)
        this.codelenses.didDeleteTask(task)
        this.contentStore.delete(task.id)
        this.decorator.didCompleteTask(task)
        this.tasks.delete(task.id)
        this.taskViewProvider.removeTreeItemByID(task.id)
    }

    public getTasks(): FixupTask[] {
        return Array.from(this.tasks.values())
    }

    // Called by the non-stop recipe to gather current state for the task.
    public async getTaskRecipeData(
        id: string,
        options: { enableSmartSelection?: boolean }
    ): Promise<VsCodeFixupTaskRecipeData | undefined> {
        const task = this.tasks.get(id)
        if (!task) {
            return undefined
        }
        const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
        if (options.enableSmartSelection && task.selectionRange) {
            const newRange = await this.getFixupTaskSmartSelection(task, task.selectionRange)
            task.selectionRange = newRange
        }

        const precedingText = document.getText(
            new vscode.Range(
                task.selectionRange.start.translate({ lineDelta: -Math.min(task.selectionRange.start.line, 50) }),
                task.selectionRange.start
            )
        )
        const selectedText = document.getText(task.selectionRange)
        // TODO: original text should be a property of the diff so that we
        // can apply diffs even while re-spinning
        task.original = selectedText
        const followingText = document.getText(
            new vscode.Range(task.selectionRange.end, task.selectionRange.end.translate({ lineDelta: 50 }))
        )

        return {
            instruction: task.instruction,
            fileName: task.fixupFile.uri.fsPath,
            precedingText,
            selectedText,
            followingText,
            selectionRange: task.selectionRange,
        }
    }

    /**
     * Speculatively attempt to match the incoming line from the LLM with
     * an existing line already in the document.
     *
     * If found, this will update the current active line for the fixup task.
     **/
    public updateActiveLine(task: FixupTask, activeContent: string): number {
        let matchingLine

        for (let i = task.activeLine; i < task.selectionRange.end.line; i++) {
            const selectionLine = task.selectionLines.get(i)
            if (selectionLine === activeContent) {
                matchingLine = i
                break
            }
        }

        if (matchingLine === undefined) {
            console.log('No match. We will expand the selection range only.', {
                current: task.selectionLines.get(task.activeLine),
                new: activeContent,
            })
            // No match, this means we are potentially adding new content.
            // We need to keep the existing active line, but expand the selection range
            task.selectionRange = new vscode.Range(
                task.selectionRange.start.with(task.selectionRange.start.line + 1, 0),
                task.selectionRange.end.with(task.selectionRange.end.line + 1, 0)
            )
        } else {
            // Found a new active line, update where we believe the LLM is changing
            console.log('We got a match! We will update the active line to the new match', {
                current: task.selectionLines.get(matchingLine + task.activeLine),
                new: activeContent,
            })
            task.activeLine = matchingLine
        }

        return task.activeLine
    }

    public async didReceiveFixupLine(id: string, line: string): Promise<void> {
        const task = this.tasks.get(id)
        if (!task) {
            return Promise.resolve()
        }

        this.updateActiveLine(task, line)
        task.replacementLine = line
        console.log('Start of selection:', task.selectionRange.start.line)
        console.log('Active line:', task.activeLine)
        console.log('End of selection:', task.selectionRange.end.line)

        return this.applyTaskLine(task)
    }

    private async applyTaskLine(task: FixupTask): Promise<void> {
        let editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri === task.fixupFile.uri)
        if (!editor) {
            editor = await vscode.window.showTextDocument(task.fixupFile.uri)
        }

        const existingLine = task.selectionLines.get(task.activeLine)
        const incomingLine = task.replacementLine || ''

        let editOk: boolean

        if (existingLine) {
            // We have a line that needs updating
            const diff = computeDiff(existingLine, incomingLine, existingLine, new vscode.Position(task.activeLine, 0))
            if (!diff) {
                console.log('NO DIFF, DOING NOTHING')
                return
            }
            editOk = await this.replaceEdit(editor, diff)
        } else {
            // Adding a new line, insert it and bump the active line by one
            editOk = await editor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(task.activeLine, 0), incomingLine)
            })
            task.activeLine = task.activeLine + 1
        }

        if (!editOk) {
            console.log('EDIT NOT OK!!')
            return
        }
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
                })
                break
        }
        this.textDidChange(task)
        return Promise.resolve()
    }

    // Handles changes to the source document in the fixup selection, or the
    // replacement text generated by Cody.
    public textDidChange(task: FixupTask): void {
        if (task.state === CodyTaskState.finished || task.state === CodyTaskState.applied) {
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
        const deadlineMsec = Date.now() + 500

        while (this.needsDiffUpdate_.size && Date.now() < deadlineMsec) {
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

        if (this.needsDiffUpdate_.size) {
            // We did not get through the work; schedule more later.
            void this.scheduler.scheduleIdle(() => this.updateDiffs())
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

    // Callback function for the Fixup Task Tree View item Diff button
    private async showDiff(treeItem: FixupTaskTreeItem): Promise<void> {
        if (!treeItem?.id) {
            return
        }
        await this.diff(treeItem.id)
    }

    // Show diff between before and after edits
    private async diff(id: taskID): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', { op: 'diff' })
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
        if (!diff || diff.mergedText === undefined) {
            return
        }

        // show diff view between the current document and replacement
        // Add replacement content to the temp document
        await this.contentStore.set(task.id, task.fixupFile.uri)
        const tempDocUri = vscode.Uri.parse(`cody-fixup:${task.fixupFile.uri.fsPath}#${task.id}`)
        const doc = await vscode.workspace.openTextDocument(tempDocUri)
        const edit = new vscode.WorkspaceEdit()
        const range = task.selectionRange
        edit.replace(tempDocUri, range, diff.originalText)
        await vscode.workspace.applyEdit(edit)
        await doc.save()

        // Show diff between current document and replacement content
        await vscode.commands.executeCommand(
            'vscode.diff',
            tempDocUri,
            task.fixupFile.uri,
            'Cody Fixup Diff View - ' + task.id,
            {
                preview: true,
                preserveFocus: false,
                selection: range,
                label: 'Cody Fixup Diff View',
                description: 'Cody Fixup Diff View: ' + task.fixupFile.uri.fsPath,
            }
        )
    }

    // Regenerate code with the same set of instruction
    public async regenerate(id: taskID): Promise<void> {
        telemetryService.log('CodyVSCodeExtension:fixup:codeLens:clicked', { op: 'regenerate' })
        const task = this.tasks.get(id)
        if (!task) {
            return
        }
        const range = task.selectionRange
        const instruction = task.instruction
        const document = await vscode.workspace.openTextDocument(task.fixupFile.uri)
        // Remove the previous task and code lenses
        this.cancel(id)
        void vscode.commands.executeCommand('cody.command.edit-code', { range, instruction, document }, 'regenerate')
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
        this.taskViewProvider.setTreeItem(task)

        if (task.state === CodyTaskState.applying) {
            void this.apply(task.id)
        }
    }

    private reset(): void {
        this.tasks = new Map<taskID, FixupTask>()
        this.taskViewProvider.reset()
    }

    public dispose(): void {
        this.reset()
        this.codelenses.dispose()
        this.decorator.dispose()
        this.taskViewProvider.dispose()
        for (const disposable of this._disposables) {
            disposable.dispose()
        }
        this._disposables = []
    }
}
