import { PromptString, contextFiltersProvider } from '@sourcegraph/cody-shared'
import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import { structuredPatch } from 'diff'
import * as vscode from 'vscode'
import { displayPath } from '../../../../../../lib/shared/src/editor/displayPath'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier, type ShouldUseContextParams, shouldBeUsedAsContext } from '../../utils'

interface TrackedDocument {
    content: string
    languageId: string
    uri: vscode.Uri
    changes: { timestamp: number; change: vscode.TextDocumentContentChangeEvent }[]
}

export interface RecentEditsRetrieverOptions {
    maxAgeMs: number
    addLineNumbersForDiff?: boolean
}

interface DiffAcrossDocuments {
    diff: PromptString
    uri: vscode.Uri
    languageId: string
    latestChangeTimestamp: number
}

export class RecentEditsRetriever implements vscode.Disposable, ContextRetriever {
    // We use a map from the document URI to the set of tracked completions inside that document to
    // improve performance of the `onDidChangeTextDocument` event handler.
    private trackedDocuments: Map<string, TrackedDocument> = new Map()
    public identifier = RetrieverIdentifier.RecentEditsRetriever
    private disposables: vscode.Disposable[] = []
    private readonly maxAgeMs: number
    private readonly addLineNumbersForDiff: boolean

    constructor(
        options: RecentEditsRetrieverOptions,
        readonly workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles' | 'onDidOpenTextDocument'
        > = vscode.workspace
    ) {
        this.maxAgeMs = options.maxAgeMs
        this.addLineNumbersForDiff = options.addLineNumbersForDiff ?? false
        // Track the already open documents when editor was opened
        for (const document of vscode.workspace.textDocuments) {
            this.trackDocument(document)
        }
        // Set up event listeners for changes
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
        this.disposables.push(workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this)))
        this.disposables.push(workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this)))
        this.disposables.push(workspace.onDidOpenTextDocument(this.onDidOpenTextDocument.bind(this)))
    }

    public async retrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const rawDiffs = await this.getDiffAcrossDocuments()
        const diffs = this.filterCandidateDiffs(rawDiffs, options.document)
        // Heuristics ordering by timestamp, taking the most recent diffs first.
        diffs.sort((a, b) => b.latestChangeTimestamp - a.latestChangeTimestamp)

        const autocompleteContextSnippets = []
        for (const diff of diffs) {
            const content = diff.diff.toString()
            const autocompleteSnippet = {
                uri: diff.uri,
                identifier: this.identifier,
                content,
            } satisfies Omit<AutocompleteContextSnippet, 'startLine' | 'endLine'>
            autocompleteContextSnippets.push(autocompleteSnippet)
        }
        // TODO: add `startLine` and `endLine` to `responses` or explicitly add
        // remove the startLine and endLine from the response similar to how we did
        // it for BFG.
        // @ts-ignore
        return autocompleteContextSnippets
    }

    public async getDiffAcrossDocuments(): Promise<DiffAcrossDocuments[]> {
        const diffs: DiffAcrossDocuments[] = []
        const diffPromises = Array.from(this.trackedDocuments.entries()).map(
            async ([uri, trackedDocument]) => {
                const diff = await this.getDiff(vscode.Uri.parse(uri))
                if (diff && trackedDocument.changes.length > 0) {
                    return {
                        diff,
                        uri: trackedDocument.uri,
                        languageId: trackedDocument.languageId,
                        latestChangeTimestamp: Math.max(
                            ...trackedDocument.changes.map(c => c.timestamp)
                        ),
                    }
                }
                return null
            }
        )
        const results = await Promise.all(diffPromises)
        diffs.push(...results.filter((result): result is DiffAcrossDocuments => result !== null))
        return diffs
    }

    public filterCandidateDiffs(
        allDiffs: DiffAcrossDocuments[],
        document: vscode.TextDocument
    ): DiffAcrossDocuments[] {
        const filterCandidateDiffs: DiffAcrossDocuments[] = []
        for (const diff of allDiffs) {
            const currentDocumentLanguageId = document.languageId
            const params: ShouldUseContextParams = {
                baseLanguageId: currentDocumentLanguageId,
                languageId: diff.languageId,
            }
            if (shouldBeUsedAsContext(params)) {
                filterCandidateDiffs.push(diff)
            }
        }
        return filterCandidateDiffs
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    public async getDiff(uri: vscode.Uri): Promise<PromptString | null> {
        if (await contextFiltersProvider.isUriIgnored(uri)) {
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
        if (this.addLineNumbersForDiff) {
            return this.computeDiffWithLineNumbers(uri, oldContent, newContent)
        }
        return PromptString.fromGitDiff(uri, oldContent, newContent)
    }

    private computeDiffWithLineNumbers(
        uri: vscode.Uri,
        originalContent: string,
        modifiedContent: string
    ): PromptString {
        const hunkDiffs = []
        const filename = displayPath(uri)
        const patch = structuredPatch(`a/${filename}`, `b/${filename}`, originalContent, modifiedContent)
        for (const hunk of patch.hunks) {
            const diffString = this.getDiffStringForHunkWithLineNumbers(hunk)
            hunkDiffs.push(diffString)
        }
        const gitDiff = PromptString.fromStructuredGitDiff(uri, hunkDiffs.join('\nthen\n'))
        return gitDiff
    }

    private getDiffStringForHunkWithLineNumbers(hunk: Diff.Hunk): string {
        const lines = []
        let oldLineNumber = hunk.oldStart
        let newLineNumber = hunk.newStart
        for (const line of hunk.lines) {
            if (line.length === 0) {
                continue
            }
            if (line[0] === '-') {
                lines.push(`${oldLineNumber}${line[0]}| ${line.slice(1)}`)
                oldLineNumber++
            } else if (line[0] === '+') {
                lines.push(`${newLineNumber}${line[0]}| ${line.slice(1)}`)
                newLineNumber++
            } else if (line[0] === ' ') {
                lines.push(`${newLineNumber}${line[0]}| ${line.slice(1)}`)
                oldLineNumber++
                newLineNumber++
            }
        }
        return lines.join('\n')
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        const trackedDocument = this.trackedDocuments.get(event.document.uri.toString())
        if (!trackedDocument) {
            return
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
            trackedDocument.content = applyChanges(
                trackedDocument.content,
                outdatedChanges.map(c => c.change)
            )
            trackedDocument.changes = trackedDocument.changes.slice(firstNonOutdatedChangeIndex)
        }
    }

    private onDidOpenTextDocument(document: vscode.TextDocument): void {
        if (!this.trackedDocuments.has(document.uri.toString())) {
            this.trackDocument(document)
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
