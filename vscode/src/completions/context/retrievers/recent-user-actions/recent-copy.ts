import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import * as vscode from 'vscode'
import type { ContextRetriever } from '../../../types'
import { RetrieverIdentifier } from '../../utils'

interface TrackedSelection {
    timestamp: number
    content: string
    languageId: string
    uri: vscode.Uri
    startPosition: vscode.Position
    endPosition: vscode.Position
}

interface RecentCopyRetrieverOptions {
    maxAgeMs: number
    maxSelections: number
}

export class RecentCopyRetriever implements vscode.Disposable, ContextRetriever {
    public identifier = RetrieverIdentifier.RecentCopyRetriever
    private disposables: vscode.Disposable[] = []
    private trackedSelections: TrackedSelection[] = []

    private readonly maxAgeMs: number
    private readonly maxSelections: number

    constructor(
        options: RecentCopyRetrieverOptions,
        private window: Pick<typeof vscode.window, 'onDidChangeTextEditorSelection'> = vscode.window
    ) {
        this.maxAgeMs = options.maxAgeMs
        this.maxSelections = options.maxSelections

        const onSelectionChange = debounce(this.onDidChangeTextEditorSelection.bind(this), 500)
        this.disposables.push(this.window.onDidChangeTextEditorSelection(onSelectionChange))
    }

    public async retrieve(): Promise<AutocompleteContextSnippet[]> {
        const clipboardContent = await this.getClipboardContent()
        const selectionItem = this.getSelectionItemIfExist(clipboardContent)
        if (selectionItem) {
            const autocompleteItem: AutocompleteContextSnippet = {
                identifier: this.identifier,
                content: selectionItem.content,
                uri: selectionItem.uri,
                startLine: selectionItem.startPosition.line,
                endLine: selectionItem.endPosition.line,
            }
            return [autocompleteItem]
        }
        return []
    }

    // This is seperate function because we mock the function in tests
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

    private addSelectionForTracking(document: vscode.TextDocument, selection: vscode.Selection): void {
        if (selection.isEmpty) {
            return
        }
        const selectedText = document.getText(selection)

        const newSelection: TrackedSelection = {
            timestamp: Date.now(),
            content: selectedText,
            languageId: document.languageId,
            uri: document.uri,
            startPosition: selection.start,
            endPosition: selection.end,
        }

        this.updateTrackedSelections(newSelection)
    }

    private updateTrackedSelections(newSelection: TrackedSelection): void {
        const now = Date.now()
        this.trackedSelections = this.trackedSelections.filter(
            selection =>
                now - selection.timestamp < this.maxAgeMs && !this.isOverlapping(selection, newSelection)
        )

        this.trackedSelections.unshift(newSelection)
        this.trackedSelections = this.trackedSelections.slice(0, this.maxSelections)
    }

    // Even with debounce, there is a chance that the same selection is added multiple times if user is slowly selecting
    // In that case, we should remove the older selections
    private isOverlapping(selection: TrackedSelection, newSelection: TrackedSelection): boolean {
        if (selection.uri.toString() !== newSelection.uri.toString()) {
            return false
        }
        return (
            newSelection.startPosition.isBeforeOrEqual(selection.startPosition) &&
            newSelection.endPosition.isAfterOrEqual(selection.endPosition)
        )
    }

    private onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
        const editor = event.textEditor
        const selection = event.selections[0]
        this.addSelectionForTracking(editor.document, selection)
    }

    public dispose(): void {
        this.trackedSelections = []
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
