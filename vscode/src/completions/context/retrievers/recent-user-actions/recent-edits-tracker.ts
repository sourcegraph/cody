import * as vscode from 'vscode'
import { getPositionAfterTextInsertion } from '../../../text-processing/utils'
import type { TextDocumentChange } from './recent-edits-diff-helpers/recent-edits-diff-strategy'
import { applyTextDocumentChanges } from './recent-edits-diff-helpers/utils'

export interface TrackedDocument {
    content: string
    languageId: string
    uri: vscode.Uri
    changes: TextDocumentChange[]
}

export class RecentEditsTracker implements vscode.Disposable {
    // We use a map from the document URI to the set of tracked completions inside that document to
    // improve performance of the `onDidChangeTextDocument` event handler.
    private trackedDocuments: Map<string, TrackedDocument> = new Map()
    private disposables: vscode.Disposable[] = []

    constructor(
        private readonly maxAgeMs: number,
        readonly workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles' | 'onDidOpenTextDocument'
        > = vscode.workspace
    ) {
        // Track the already open documents when editor was opened
        for (const document of vscode.workspace.textDocuments) {
            this.trackDocument(document)
        }
        this.disposables.push(
            workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)),
            workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)),
            workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this)),
            workspace.onDidOpenTextDocument(this.onDidOpenTextDocument.bind(this))
        )
    }

    public getTrackedDocumentForUri(uri: vscode.Uri): TrackedDocument | undefined {
        return this.trackedDocuments.get(uri.toString())
    }

    public getTrackedDocumentsMapping(): Map<string, TrackedDocument> {
        return this.trackedDocuments
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        const trackedDocument = this.trackedDocuments.get(event.document.uri.toString())
        if (!trackedDocument) {
            return
        }

        const now = Date.now()
        for (const change of event.contentChanges) {
            const insertedRange = new vscode.Range(
                change.range.start,
                getPositionAfterTextInsertion(change.range.start, change.text)
            )
            trackedDocument.changes.push({
                timestamp: now,
                change,
                insertedRange,
            })
        }

        this.reconcileOutdatedChanges()
    }

    private onDidOpenTextDocument(document: vscode.TextDocument): void {
        if (!this.trackedDocuments.has(document.uri.toString())) {
            this.trackDocument(document)
        }
    }

    private onDidRenameFiles(event: vscode.FileRenameEvent): void {
        for (const file of event.files) {
            const trackedDocument = this.trackedDocuments.get(file.oldUri.toString())
            if (trackedDocument) {
                this.trackedDocuments.set(file.newUri.toString(), trackedDocument)
                this.trackedDocuments.delete(file.oldUri.toString())
            }
        }
    }

    private onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
        for (const uri of event.files) {
            this.trackedDocuments.delete(uri.toString())
        }
    }

    private trackDocument(document: vscode.TextDocument): void {
        if (document.uri.scheme !== 'file') {
            return
        }
        const trackedDocument: TrackedDocument = {
            content: document.getText(),
            languageId: document.languageId,
            uri: document.uri,
            changes: [],
        }
        this.trackedDocuments.set(document.uri.toString(), trackedDocument)
    }

    private reconcileOutdatedChanges(): void {
        const now = Date.now()
        for (const [, trackedDocument] of this.trackedDocuments) {
            const firstNonOutdatedChangeIndex = trackedDocument.changes.findIndex(
                c => now - c.timestamp < this.maxAgeMs
            )

            const outdatedChanges = trackedDocument.changes.slice(0, firstNonOutdatedChangeIndex)
            trackedDocument.content = applyTextDocumentChanges(
                trackedDocument.content,
                outdatedChanges.map(c => c.change)
            )
            trackedDocument.changes = trackedDocument.changes.slice(firstNonOutdatedChangeIndex)
        }
    }

    public dispose(): void {
        this.trackedDocuments.clear()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
