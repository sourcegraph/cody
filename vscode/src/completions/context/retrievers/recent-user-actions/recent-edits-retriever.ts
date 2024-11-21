import path from 'node:path'
import { type PromptString, contextFiltersProvider } from '@sourcegraph/cody-shared'
import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier, type ShouldUseContextParams, shouldBeUsedAsContext } from '../../utils'
import {
    type DiffHunk,
    type RecentEditsRetrieverDiffStrategy,
    type RecentEditsRetrieverDiffStrategyIdentifier,
    type TextDocumentChange,
    createDiffStrategy,
} from './recent-edits-diff-helpers/base'
import {
    applyTextDocumentChanges,
    getNewContentAfterApplyingRange,
} from './recent-edits-diff-helpers/utils'

interface TrackedDocument {
    content: string
    languageId: string
    uri: vscode.Uri
    changes: TextDocumentChange[]
}

export interface RecentEditsRetrieverOptions {
    maxAgeMs: number
    diffStrategyIdentifier: RecentEditsRetrieverDiffStrategyIdentifier
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
    private readonly diffStrategyIdentifier: RecentEditsRetrieverDiffStrategyIdentifier
    private readonly diffStrategy: RecentEditsRetrieverDiffStrategy

    constructor(
        options: RecentEditsRetrieverOptions,
        readonly workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles' | 'onDidOpenTextDocument'
        > = vscode.workspace
    ) {
        this.maxAgeMs = options.maxAgeMs
        this.diffStrategyIdentifier = options.diffStrategyIdentifier
        this.diffStrategy = createDiffStrategy(this.diffStrategyIdentifier)

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
        for (const diff of diffs) {
            const content = diff.diff.toString()
            const autocompleteSnippet = {
                uri: diff.uri,
                identifier: this.identifier,
                content,
                metadata: {
                    timeSinceActionMs: Date.now() - diff.latestChangeTimestamp,
                    recentEditsRetrieverDiffStrategy: this.diffStrategyIdentifier,
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
                if (trackedDocument.changes.length===0) {
                    return null
                }
                const diffHunks = await this.getDiff(vscode.Uri.parse(uri))
                if (diffHunks) {
                    return diffHunks.map(diffHunk => ({
                        diff: diffHunk.diff,
                        uri: trackedDocument.uri,
                        languageId: trackedDocument.languageId,
                        latestChangeTimestamp: diffHunk.latestEditTimestamp,
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

    public async getDiff(uri: vscode.Uri): Promise<DiffHunk[] | null> {
        if (await contextFiltersProvider.isUriIgnored(uri)) {
            return null
        }

        const trackedDocument = this.trackedDocuments.get(uri.toString())
        if (!trackedDocument) {
            return null
        }
        const diffHunks = this.diffStrategy.getDiffHunks({
            uri: trackedDocument.uri,
            oldContent: trackedDocument.content,
            changes: trackedDocument.changes,
        })
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
        const oldCursorPosition = event.contentChanges[0].range.end
        for (const change of event.contentChanges) {
            const oldContent =
                trackedDocument.changes.length > 0
                    ? trackedDocument.changes[trackedDocument.changes.length - 1].newContent
                    : trackedDocument.content
            const newCursorPosition = calculateNewCursorPositions(change, oldCursorPosition)
            const newContent = getNewContentAfterApplyingRange(oldContent, change)
            const insertedRange = calculateInsertedRangeInDocumentBasedOnChange(
                oldContent,
                newContent,
                change
            )

            trackedDocument.changes.push({
                timestamp: now,
                oldCursorPosition,
                newCursorPosition,
                oldContent,
                newContent,
                replacedRange: change.range,
                insertedRange,
                change,
            })
        }
        this.reconcileOutdatedChanges()
        this.logTextDocument(trackedDocument)
    }

    private logTextDocument(trackedDocument: TrackedDocument): void {
        const fileName = trackedDocument.uri.fsPath.split('/').pop()?.split('.')[0] || 'document'
        const logPath = trackedDocument.uri.fsPath.replace(/[^/\\]+$/, `${fileName}.json`)
        const finalLogPath = path.join('/Users/hiteshsagtani/Desktop/diff-logs', path.basename(logPath))
        const fs = require('fs')
        fs.writeFileSync(finalLogPath, JSON.stringify(trackedDocument, null, 2))
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

export function calculateInsertedRangeInDocumentBasedOnChange(
    oldContent: string,
    newContent: string,
    change: vscode.TextDocumentContentChangeEvent
): vscode.Range {
    // Function calculates the updated range for the new document based on the change.
    const startOffset = change.rangeOffset
    const endOffset = startOffset + change.text.length

    const startPosition = getPositionAt(newContent, startOffset)
    const endPosition = getPositionAt(newContent, endOffset)

    return new vscode.Range(startPosition, endPosition)
}

// Helper function to convert an offset to a Position (line and character)
function getPositionAt(content: string, offset: number): vscode.Position {
    let line = 0
    let character = 0
    let i = 0

    while (i < offset) {
        if (content[i] === '\n') {
            line++
            character = 0
        } else {
            character++
        }
        i++
    }

    return new vscode.Position(line, character)
}

export function calculateNewCursorPositions(
    change: vscode.TextDocumentContentChangeEvent,
    oldCursorPosition: vscode.Position
): vscode.Position {
    // Starting position of the change
    const start = change.range.start

    // Inserted text and its lines
    const insertedText = change.text
    const insertedLines = insertedText.split('\n')
    let newCursorPosition: vscode.Position
    if (insertedLines.length === 1) {
        newCursorPosition = new vscode.Position(start.line, start.character + insertedText.length)
    } else {
        const newLineCount = insertedLines.length - 1
        const lastLineLength = insertedLines[insertedLines.length - 1].length
        newCursorPosition = new vscode.Position(start.line + newLineCount, lastLineLength)
    }
    return newCursorPosition
}
