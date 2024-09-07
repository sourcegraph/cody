import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ContextRetriever } from '../../../types'

interface TrackedSelections {
    timestamp: number
    content: string
    languageId: string
    uri: vscode.Uri
    startLine: number
    endLine: number
}

export class RecentCopyRetriever implements vscode.Disposable, ContextRetriever {
    // We use a map from the document URI to the set of tracked completions inside that document to
    // improve performance of the `onDidChangeTextDocument` event handler.
    private trackedSelections: TrackedSelections[] = new Array<TrackedSelections>()
    public identifier = 'recent-copy'
    private disposables: vscode.Disposable[] = []

    constructor(
        private readonly maxAgeMs: number,
        private readonly maxSelections: number
    ) {
        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection.bind(this))
        )
    }

    public async retrieve(): Promise<AutocompleteContextSnippet[]> {
        const clipboardContent = await vscode.env.clipboard.readText()
        const selectionItem = this.getSelectionItemIfExist(clipboardContent)
        if (selectionItem) {
            const autocompleteItem = {
                uri: selectionItem.uri,
                startLine: selectionItem.startLine,
                endLine: selectionItem.endLine,
                content: selectionItem.content,
            }
            return [autocompleteItem]
        }
        return []
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    private getSelectionItemIfExist(text: string): TrackedSelections | undefined {
        for (const ts of this.trackedSelections) {
            if (ts.content === text) {
                return ts
            }
        }
        return undefined
    }

    private async onDidChangeTextEditorSelection(
        event: vscode.TextEditorSelectionChangeEvent
    ): Promise<void> {
        const editor = event.textEditor
        this.addSelectionForTracking(editor.document, editor.selection)
    }

    private addSelectionForTracking(document: vscode.TextDocument, selection: vscode.Selection): void {
        if (selection.isEmpty) {
            return
        }
        const selectedText = document.getText(selection)
        const existingSelectionIndex = this.trackedSelections.findIndex(
            ts => ts.content === selectedText
        )
        if (existingSelectionIndex !== -1) {
            // Remove the selection from the tracked selections
            this.trackedSelections = this.trackedSelections.splice(existingSelectionIndex, 1)
        }
        this.trackedSelections.push({
            timestamp: Date.now(),
            content: selectedText,
            languageId: document.languageId,
            uri: document.uri,
            startLine: selection.start.line,
            endLine: selection.end.line,
        })
        this.reconcileOutdatedChanges()
    }

    private reconcileOutdatedChanges(): void {
        const now = Date.now()
        const firstOutdatedChange = this.trackedSelections.findIndex(selection => {
            return now - selection.timestamp < this.maxAgeMs
        })
        this.trackedSelections = this.trackedSelections.slice(firstOutdatedChange)
        // Limit the array to last maxSelection changes
        if (this.trackedSelections.length > this.maxSelections) {
            this.trackedSelections = this.trackedSelections.slice(-this.maxSelections)
        }
    }

    public dispose(): void {
        this.trackedSelections = []
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
