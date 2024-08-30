import { PromptString, contextFiltersProvider } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

interface TrackedDocument {
    content: string
    changes: { timestamp: number; change: vscode.TextDocumentContentChangeEvent }[]
}

export class RecentEditsRetriever implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    // We use a map from the document URI to the set of tracked completions inside that document to
    // improve performance of the `onDidChangeTextDocument` event handler.
    private trackedDocuments: Map<string, TrackedDocument> = new Map()

    constructor(
        private readonly maxAgeMs: number,
        readonly workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles'
        > = vscode.workspace
    ) {
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.disposables.push(workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)))
        this.disposables.push(workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this)))
    }

    public async getDiff(uri: vscode.Uri): Promise<PromptString | null> {
        if (await contextFiltersProvider.instance!.isUriIgnored(uri)) {
            return null
        }

        const trackedDocument = this.trackedDocuments.get(uri.toString())
        if (!trackedDocument) {
            return null
        }

        const oldContent = trackedDocument.content
        const newContent = applyChanges(
            oldContent,
            trackedDocument.changes.map(c => c.change)
        )

        return PromptString.fromGitDiff(uri, oldContent, newContent)
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        let trackedDocument = this.trackedDocuments.get(event.document.uri.toString())
        if (!trackedDocument) {
            trackedDocument = this.trackDocument(event.document)
        }

        const now = Date.now()
        for (const change of event.contentChanges) {
            trackedDocument.changes.push({
                timestamp: now,
                change,
            })
        }

        this.reconcileOutdatedChanges()
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

    public dispose(): void {
        this.trackedDocuments.clear()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }

    private trackDocument(document: vscode.TextDocument): TrackedDocument {
        const trackedDocument: TrackedDocument = {
            content: document.getText(),
            changes: [],
        }
        this.trackedDocuments.set(document.uri.toString(), trackedDocument)
        return trackedDocument
    }

    private reconcileOutdatedChanges(): void {
        const now = Date.now()
        for (const [, trackedDocument] of this.trackedDocuments) {
            const firstNonOutdatedChangeIndex = trackedDocument.changes.findIndex(
                c => now - c.timestamp < this.maxAgeMs
            )

            const outdatedChanges = trackedDocument.changes.slice(0, firstNonOutdatedChangeIndex)
            trackedDocument.content = applyChanges(
                trackedDocument.content,
                outdatedChanges.map(c => c.change)
            )
            trackedDocument.changes = trackedDocument.changes.slice(firstNonOutdatedChangeIndex)
        }
    }
}

function applyChanges(content: string, changes: vscode.TextDocumentContentChangeEvent[]): string {
    for (const change of changes) {
        content =
            content.slice(0, change.rangeOffset) +
            change.text +
            content.slice(change.rangeOffset + change.rangeLength)
    }
    return content
}
