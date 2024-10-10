import { isFileURI } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'

export const LOG_INTERVAL = 30 * 60 * 1000 // 30 minutes
const LARGE_CHANGE_THRESHOLD = 1000
const LARGE_CHANGE_TIMEOUT = 1000 // Ignore large changes happened within this time.
const SELECTION_TIMEOUT = 5000 // 5 seconds

export class CharactersLogger implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private inserted = 0
    private deleted = 0
    private nextTimeoutId: NodeJS.Timeout | null = null

    private windowFocused = true
    private visibleDocuments = new Set<string>()
    private lastChangeTimestamp = 0
    private lastSelectionTimestamps = new Map<string, number>()

    constructor(
        workspace: Pick<typeof vscode.workspace, 'onDidChangeTextDocument'> = vscode.workspace,
        window: Pick<
            typeof vscode.window,
            | 'onDidChangeWindowState'
            | 'onDidChangeVisibleTextEditors'
            | 'onDidChangeTextEditorSelection'
            | 'visibleTextEditors'
        > = vscode.window
    ) {
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.disposables.push(window.onDidChangeWindowState(this.onDidChangeWindowState.bind(this)))
        this.disposables.push(
            window.onDidChangeVisibleTextEditors(this.onDidChangeVisibleTextEditors.bind(this))
        )
        this.disposables.push(
            window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection.bind(this))
        )

        this.updateVisibleDocuments(window.visibleTextEditors)
        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }

    public flush(): void {
        this.nextTimeoutId = null
        const insertedCharacters = this.inserted
        const deletedCharacters = this.deleted
        this.inserted = 0
        this.deleted = 0

        telemetryRecorder.recordEvent('cody.characters', 'flush', {
            metadata: { insertedCharacters, deletedCharacters },
        })

        this.nextTimeoutId = setTimeout(() => this.flush(), LOG_INTERVAL)
    }

    private onDidChangeWindowState(state: vscode.WindowState): void {
        this.windowFocused = state.focused
    }

    private onDidChangeVisibleTextEditors(editors: Readonly<vscode.TextEditor[]>): void {
        this.updateVisibleDocuments(editors)
    }

    private onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
        const documentUri = event.textEditor.document.uri.toString()
        this.lastSelectionTimestamps.set(documentUri, Date.now())
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        const currentTimestamp = Date.now()
        const documentUri = event.document.uri.toString()

        // Ignored non-file URI document
        if (!isFileURI(event.document.uri)) {
            return
        }

        // Ignored undo/redo change in document
        if (
            event.reason === vscode.TextDocumentChangeReason.Undo ||
            event.reason === vscode.TextDocumentChangeReason.Redo
        ) {
            return
        }

        // Ignored change while window not focused in document
        if (!this.windowFocused) {
            return
        }

        // Ignored change in non-visible document
        if (!this.visibleDocuments.has(documentUri)) {
            return
        }

        // Check if there has been recent cursor movement in this document
        const lastSelectionTimestamp = this.lastSelectionTimestamps.get(documentUri) || 0
        const timeSinceLastSelection = currentTimestamp - lastSelectionTimestamp

        // Ignored change due to inactive selection in document
        if (timeSinceLastSelection > SELECTION_TIMEOUT) {
            return
        }

        // Time-based heuristics to detect rapid, large changes
        const timeSinceLastChange = currentTimestamp - this.lastChangeTimestamp
        const totalChangeSize = event.contentChanges.reduce((sum, change) => {
            return sum + Math.abs(change.rangeLength) + Math.abs(change.text.length)
        }, 0)

        // Ignored rapid large change in document
        if (totalChangeSize > LARGE_CHANGE_THRESHOLD && timeSinceLastChange < LARGE_CHANGE_TIMEOUT) {
            return
        }

        // Proceed with processing the changes
        for (const change of event.contentChanges) {
            // We use change.rangeLength for deletions because:
            // 1. It represents the length of the text being replaced, including newline characters.
            // 2. It accurately accounts for multi-line deletions.
            // 3. For pure deletions (without insertions), this will be the number of characters removed.
            // 4. For replacements, this represents the "old" text that's being replaced.
            this.deleted += change.rangeLength

            // We use change.text.length for insertions because:
            // 1. It represents the length of the new text being inserted, including newline characters.
            // 2. It accurately accounts for multi-line insertions.
            // 3. For pure insertions (without deletions), this will be the number of characters added.
            // 4. For replacements, this represents the "new" text that's replacing the old.
            this.inserted += change.text.length

            // Note: In the case of replacements, both deleted and inserted will be incremented.
            // This accurately represents that some text was removed and some was added, even if
            // the lengths are the same.
        }

        // Update the last change timestamp only when changes are processed
        this.lastChangeTimestamp = currentTimestamp
    }

    private updateVisibleDocuments(editors: Readonly<vscode.TextEditor[]>): void {
        this.visibleDocuments.clear()
        for (const editor of editors) {
            const uri = editor.document.uri.toString()
            this.visibleDocuments.add(uri)
        }
    }

    public dispose(): void {
        this.flush()
        if (this.nextTimeoutId) {
            clearTimeout(this.nextTimeoutId)
        }
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
