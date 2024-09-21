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
    startLine: number
    endLine: number
}

interface RecentCopyRetrieverOptions {
    maxAgeMs: number
    maxSelections: number
}

export class RecentCopyRetriever implements vscode.Disposable, ContextRetriever {
    public identifier = RetrieverIdentifier.RecentCopyRetriever
    private trackedSelections: Map<string, TrackedSelection[]> = new Map()
    private disposables: vscode.Disposable[] = []

    private readonly maxAgeMs: number
    private readonly maxSelections: number

    constructor(
        options: RecentCopyRetrieverOptions,
        private window: Pick<typeof vscode.window, 'onDidChangeTextEditorSelection'> = vscode.window,
        private workspace: Pick<
            typeof vscode.workspace,
            'onDidRenameFiles' | 'onDidDeleteFiles'
        > = vscode.workspace
    ) {
        this.maxAgeMs = options.maxAgeMs
        this.maxSelections = options.maxSelections

        const onSelectionChange = debounce(this.onDidChangeTextEditorSelection.bind(this), 100)

        this.disposables.push(
            this.window.onDidChangeTextEditorSelection(onSelectionChange),
            this.workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)),
            this.workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this))
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
        return Array.from(this.trackedSelections.values()).flat()
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    private getSelectionItemIfExist(text: string): TrackedSelection | undefined {
        for (const selections of this.trackedSelections.values()) {
            const found = selections.find(ts => ts.content === text)
            if (found) {
                return found
            }
        }
        return undefined
    }

    private addSelectionForTracking(document: vscode.TextDocument, selection: vscode.Selection): void {
        if (selection.isEmpty) {
            return
        }
        const selectedText = document.getText(selection)
        const uriString = document.uri.toString()

        if (!this.trackedSelections.has(uriString)) {
            this.trackedSelections.set(uriString, [])
        }

        const selections = this.trackedSelections.get(uriString)!
        const existingSelectionIndex = selections.findIndex(ts => ts.content === selectedText)

        if (existingSelectionIndex !== -1) {
            selections.splice(existingSelectionIndex, 1)
        }

        selections.push({
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
        for (const [uri, selections] of this.trackedSelections) {
            const updatedSelections = selections.filter(
                selection => now - selection.timestamp < this.maxAgeMs
            )
            if (updatedSelections.length > this.maxSelections) {
                updatedSelections.splice(0, updatedSelections.length - this.maxSelections)
            }
            this.trackedSelections.set(uri, updatedSelections)
        }
    }

    private onDidRenameFiles(event: vscode.FileRenameEvent): void {
        for (const file of event.files) {
            const trackedSelections = this.trackedSelections.get(file.oldUri.toString())
            if (trackedSelections) {
                this.trackedSelections.set(file.newUri.toString(), trackedSelections)
                this.trackedSelections.delete(file.oldUri.toString())
            }
        }
    }

    private onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
        for (const uri of event.files) {
            this.trackedSelections.delete(uri.toString())
        }
    }

    private onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): void {
        const editor = event.textEditor
        this.addSelectionForTracking(editor.document, event.selections[0])
    }

    public dispose(): void {
        this.trackedSelections.clear()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
