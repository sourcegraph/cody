import { type PromptString, contextFiltersProvider } from '@sourcegraph/cody-shared'
import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import type { AutocompleteContextSnippetMetadataFields } from '@sourcegraph/cody-shared'
import { LRUCache } from 'lru-cache'
import * as vscode from 'vscode'
import { autoeditsOutputChannelLogger } from '../../../../autoedits/output-channel-logger'
import type { ContextRetriever, ContextRetrieverOptions } from '../../../types'
import { RetrieverIdentifier, type ShouldUseContextParams, shouldBeUsedAsContext } from '../../utils'
import type {
    DiffHunk,
    RecentEditsRetrieverDiffStrategy,
} from './recent-edits-diff-helpers/recent-edits-diff-strategy'
import { RecentEditsTracker, getCacheKeyForTrackedDocument } from './recent-edits-tracker'

interface DiffHunkWithStrategy extends DiffHunk {
    diffStrategyMetadata: AutocompleteContextSnippetMetadataFields
}

interface RecentEditsRetrieverOptions {
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
    public identifier = RetrieverIdentifier.RecentEditsRetriever
    private readonly diffStrategyList: RecentEditsRetrieverDiffStrategy[]
    private readonly recentEditsTracker: RecentEditsTracker
    private cache: LRUCache<string, DiffHunkWithStrategy[]>

    constructor(
        options: RecentEditsRetrieverOptions,
        workspace: Pick<
            typeof vscode.workspace,
            'onDidChangeTextDocument' | 'onDidRenameFiles' | 'onDidDeleteFiles' | 'onDidOpenTextDocument'
        > = vscode.workspace
    ) {
        this.cache = new LRUCache({ max: 500 })
        this.recentEditsTracker = new RecentEditsTracker(options.maxAgeMs, workspace)
        this.diffStrategyList = options.diffStrategyList
    }

    public async retrieve(options: ContextRetrieverOptions): Promise<AutocompleteContextSnippet[]> {
        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'recent edits retrieve',
            'Retrieving recent edits context'
        )

        const rawDiffs = await this.getDiffAcrossDocuments()
        const diffs = this.filterCandidateDiffs(rawDiffs, options.document)
        // Heuristics ordering by timestamp, taking the most recent diffs first.
        diffs.sort((a, b) => b.latestChangeTimestamp - a.latestChangeTimestamp)

        const autocompleteContextSnippets = []
        const retrievalTriggerTime = Date.now()
        for (const diff of diffs) {
            const content = diff.diff.toString()
            const autocompleteSnippet: AutocompleteContextSnippet = {
                type: 'base',
                uri: diff.uri,
                identifier: this.identifier,
                content,
                metadata: {
                    timeSinceActionMs: retrievalTriggerTime - diff.latestChangeTimestamp,
                    retrieverMetadata: diff.diffStrategyMetadata,
                },
            }
            autocompleteContextSnippets.push(autocompleteSnippet)
        }
        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'recent edits retrieve',
            `Retrieved ${autocompleteContextSnippets.length} recent edits context`
        )
        return autocompleteContextSnippets
    }

    public async getDiffAcrossDocuments(): Promise<DiffAcrossDocuments[]> {
        const diffs: DiffAcrossDocuments[] = []
        const trackedDocuments = this.recentEditsTracker.getTrackedDocumentsMapping()
        const diffPromises = Array.from(trackedDocuments.entries()).map(
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
        const trackedDocument = this.recentEditsTracker.getTrackedDocumentForUri(uri)
        if (!trackedDocument || trackedDocument.changes.length === 0) {
            return null
        }
        const cacheKey = getCacheKeyForTrackedDocument(trackedDocument)
        const cached = this.cache.get(cacheKey)
        if (cached) {
            return cached
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
        this.cache.set(cacheKey, diffHunks)
        return diffHunks
    }

    public isSupportedForLanguageId(): boolean {
        return true
    }

    public dispose(): void {
        this.recentEditsTracker.dispose()
    }
}
