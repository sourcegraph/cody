import { type PromptString, contextFiltersProvider } from '@sourcegraph/cody-shared'
import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import type { AutocompleteContextSnippetMetadataFields } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { getPositionAfterTextInsertion } from '../../../text-processing/utils'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier, type ShouldUseContextParams, shouldBeUsedAsContext } from '../../utils'
import type {
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
    TextDocumentChange,
} from './recent-edits-diff-helpers/recent-edits-diff-strategy'
import { applyTextDocumentChanges } from './recent-edits-diff-helpers/utils'

interface TrackedDocument {
    content: string
    languageId: string
    uri: vscode.Uri
    changes: TextDocumentChange[]
}

interface DiffHunkWithStrategy extends DiffHunk {
    diffStrategyMetadata: AutocompleteContextSnippetMetadataFields
}

export interface RecentEditsRetrieverOptions {
    maxAgeMs: number
    diffStrategyList: RecentEditsRetrieverDiffStrategy[]
}

interface DiffAcrossDocuments {
    diff: PromptString
    uri: vscode.Uri
    languageId: string
    latestChangeTimestamp: number
    diffStrategyMetadata: AutocompleteContextSnippetMetadataFields
}

export class RecentEditsRetriever implements vscode.Disposable, ContextRetriever {
    // We use a map from the document URI to the set of tracked completions inside that document to
    // improve performance of the `onDidChangeTextDocument` event handler.
    private trackedDocuments: Map<string, TrackedDocument> = new Map()
    public identifier = RetrieverIdentifier.RecentEditsRetriever
    private disposables: vscode.Disposable[] = []
    private readonly maxAgeMs: number
    private readonly diffStrategyList: RecentEditsRetrieverDiffStrategy[]

    constructor(
        options: RecentEditsRetrieverOptions,
        readonly workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles' | 'onDidOpenTextDocument'
        > = vscode.workspace
    ) {
        this.maxAgeMs = options.maxAgeMs
        this.diffStrategyList = options.diffStrategyList

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

    public async retrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        const rawDiffs = await this.getDiffAcrossDocuments()
        const diffs = this.filterCandidateDiffs(rawDiffs, options.document)
        // Heuristics ordering by timestamp, taking the most recent diffs first.
        diffs.sort((a, b) => b.latestChangeTimestamp - a.latestChangeTimestamp)

        const autocompleteContextSnippets = []
        const retrievalTriggerTime = Date.now()
        for (const diff of diffs) {
            const content = diff.diff.toString()
            const autocompleteSnippet = {
                uri: diff.uri,
                identifier: this.identifier,
                content,
                metadata: {
                    timeSinceActionMs: retrievalTriggerTime - diff.latestChangeTimestamp,
                    retrieverMetadata: diff.diffStrategyMetadata,
                },
            } satisfies Omit<AutocompleteContextSnippet, 'startLine' | 'endLine'>
            autocompleteContextSnippets.push(autocompleteSnippet)
        }
        // remove the startLine and endLine from the response similar to how we did
        // it for BFG.
        // @ts-ignore
        return autocompleteContextSnippets
    }

    public async getDiffAcrossDocuments(): Promise<DiffAcrossDocuments[]> {
        const diffs: DiffAcrossDocuments[] = []
        const diffPromises = Array.from(this.trackedDocuments.entries()).map(
            async ([uri, trackedDocument]) => {
                if (trackedDocument.changes.length === 0) {
                    return null
                }
                const diffHunks = await this.getDiff(vscode.Uri.parse(uri))
                if (diffHunks) {
                    return diffHunks.map(diffHunk => ({
                        diff: diffHunk.diff,
                        uri: trackedDocument.uri,
                        languageId: trackedDocument.languageId,
                        latestChangeTimestamp: diffHunk.latestEditTimestamp,
                        diffStrategyMetadata: diffHunk.diffStrategyMetadata,
                    }))
                }
                return null
            }
        )
        const results = await Promise.all(diffPromises)
        diffs.push(
            ...results.filter((result): result is DiffAcrossDocuments[] => result !== null).flat()
        )
        return diffs
    }

    private filterCandidateDiffs(
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

    public async getDiff(uri: vscode.Uri): Promise<DiffHunkWithStrategy[] | null> {
        if (await contextFiltersProvider.isUriIgnored(uri)) {
            return null
        }

        const trackedDocument = this.trackedDocuments.get(uri.toString())
        if (!trackedDocument) {
            return null
        }
        const diffHunks: DiffHunkWithStrategy[] = []
        for (const diffStrategy of this.diffStrategyList) {
            const hunks = diffStrategy.getDiffHunks({
                uri: trackedDocument.uri,
                oldContent: trackedDocument.content,
                changes: trackedDocument.changes,
            })
            for (const hunk of hunks) {
                diffHunks.push({
                    ...hunk,
                    diffStrategyMetadata: diffStrategy.getDiffStrategyMetadata(),
                })
            }
        }
        return diffHunks
    }

    public isSupportedForLanguageId(): boolean {
        return true
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
