import { isFileURI } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'

export const LOG_INTERVAL = 30 * 60 * 1000 // 30 minutes
const LARGE_CHANGE_THRESHOLD = 1000
const LARGE_CHANGE_TIMEOUT = 1000 // Ignore large changes happened within this time.
const SELECTION_TIMEOUT = 5000 // 5 seconds

const DOCUMENT_CHANGE_TYPES = [
    'normal',
    'undo',
    'redo',
    'windowNotFocused',
    'nonVisibleDocument',
    'inactiveSelection',
    'rapidLargeChange',
] as const

type DocumentChangeType = (typeof DOCUMENT_CHANGE_TYPES)[number]

// This flat structure is required by the 'metadata' field type in the telemetry event.
export type DocumentChangeCounters = {
    [K in `${DocumentChangeType}_${'inserted' | 'deleted'}`]: number
}

export const DEFAULT_COUNTERS: DocumentChangeCounters = DOCUMENT_CHANGE_TYPES.reduce(
    (acc, changeType) => {
        acc[`${changeType}_inserted`] = 0
        acc[`${changeType}_deleted`] = 0
        return acc
    },
    {} as DocumentChangeCounters
)

export class CharactersLogger implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private changeCounters: DocumentChangeCounters = { ...DEFAULT_COUNTERS }
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

        telemetryRecorder.recordEvent('cody.characters', 'flush', {
            metadata: { ...this.changeCounters },
        })
        this.changeCounters = { ...DEFAULT_COUNTERS }

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
        if (!isFileURI(event.document.uri)) {
            return
        }

        const changeType = this.getDocumentChangeType(event)

        for (const change of event.contentChanges) {
            // We use change.rangeLength for deletions because:
            // 1. It represents the length of the text being replaced, including newline characters.
            // 2. It accurately accounts for multi-line deletions.
            // 3. For pure deletions (without insertions), this will be the number of characters removed.
            // 4. For replacements, this represents the "old" text that's being replaced.
            this.changeCounters[`${changeType}_deleted`] += change.rangeLength

            // We use change.text.length for insertions because:
            // 1. It represents the length of the new text being inserted, including newline characters.
            // 2. It accurately accounts for multi-line insertions.
            // 3. For pure insertions (without deletions), this will be the number of characters added.
            // 4. For replacements, this represents the "new" text that's replacing the old.
            this.changeCounters[`${changeType}_inserted`] += change.text.length

            // Note: In the case of replacements, both deleted and inserted will be incremented.
            // This accurately represents that some text was removed and some was added, even if
            // the lengths are the same.
        }

        this.lastChangeTimestamp = Date.now()
    }

    private getDocumentChangeType(event: vscode.TextDocumentChangeEvent): DocumentChangeType {
        const currentTimestamp = Date.now()
        const documentUri = event.document.uri.toString()

        if (event.reason === vscode.TextDocumentChangeReason.Undo) {
            return 'undo'
        }
        if (event.reason === vscode.TextDocumentChangeReason.Redo) {
            return 'redo'
        }

        if (!this.windowFocused) {
            return 'windowNotFocused'
        }
        if (!this.visibleDocuments.has(documentUri)) {
            return 'nonVisibleDocument'
        }

        const lastSelectionTimestamp = this.lastSelectionTimestamps.get(documentUri) || 0
        const timeSinceLastSelection = currentTimestamp - lastSelectionTimestamp

        if (timeSinceLastSelection > SELECTION_TIMEOUT) {
            return 'inactiveSelection'
        }

        const timeSinceLastChange = currentTimestamp - this.lastChangeTimestamp
        const totalChangeSize = event.contentChanges.reduce((sum, change) => {
            return sum + Math.abs(change.rangeLength) + Math.abs(change.text.length)
        }, 0)

        if (totalChangeSize > LARGE_CHANGE_THRESHOLD && timeSinceLastChange < LARGE_CHANGE_TIMEOUT) {
            return 'rapidLargeChange'
        }

        return 'normal'
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
