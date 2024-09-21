import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ContextRetriever } from '../../../types'
import { RetrieverIdentifier } from '../../utils'

interface TrackedSelection {
    timestamp: number
    content: string
    languageId: string
    uri: vscode.Uri
    startLine: number
    endLine: number
}

interface RecentCopyRetrieverOptions {
    maxAgeMs: number
    maxSelections: number
}

export class RecentCopyRetriever implements vscode.Disposable, ContextRetriever {
    public identifier = RetrieverIdentifier.RecentCopyRetriever
    private trackedSelections: TrackedSelection[] = []
    private disposables: vscode.Disposable[] = []

    private readonly maxAgeMs: number
    private readonly maxSelections: number

    constructor(
        options: RecentCopyRetrieverOptions,
        private window: Pick<typeof vscode.window, 'onDidChangeTextEditorSelection'> = vscode.window
    ) {
        this.maxAgeMs = options.maxAgeMs
        this.maxSelections = options.maxSelections

        this.disposables.push(
            this.window.onDidChangeTextEditorSelection(this.onDidChangeTextEditorSelection.bind(this))
        )
    }

    public async retrieve(): Promise<AutocompleteContextSnippet[]> {
        const clipboardContent = await this.getClipboardContent()
        const selectionItem = this.getSelectionItemIfExist(clipboardContent)
        if (selectionItem) {
            const autocompleteItem: AutocompleteContextSnippet = {
                identifier: RetrieverIdentifier.RecentCopyRetriever,
                content: selectionItem.content,
                uri: selectionItem.uri,
                startLine: selectionItem.startLine,
                endLine: selectionItem.endLine,
            }
            return [autocompleteItem]
        }
        return []
    }

    // Separate test method also used in recent-copy.test.ts to get the vscode clipboard content
    public async getClipboardContent(): Promise<string> {
        return vscode.env.clipboard.readText()
    }

    public getTrackedSelections(): TrackedSelection[] {
        return this.trackedSelections
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    private getSelectionItemIfExist(text: string): TrackedSelection | undefined {
        return this.trackedSelections.find(ts => ts.content === text)
    }

    private onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
        const editor = event.textEditor
        this.addSelectionForTracking(editor.document, event.selections[0])
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
            this.trackedSelections.splice(existingSelectionIndex, 1)
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
        this.trackedSelections = this.trackedSelections.filter(
            selection => now - selection.timestamp < this.maxAgeMs
        )
        if (this.trackedSelections.length > this.maxSelections) {
            this.trackedSelections.splice(0, this.trackedSelections.length - this.maxSelections)
        }
    }

    public dispose(): void {
        this.trackedSelections = []
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
