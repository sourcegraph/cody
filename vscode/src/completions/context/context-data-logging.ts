import {
    type AutocompleteContextSnippet,
    isDefined,
    isDotComAuthed,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { logDebug } from '../../output-channel-logger'
import { GitHubDotComRepoMetadata } from '../../repository/githubRepoMetadata'
import { completionProviderConfig } from '../completion-provider-config'
import type { ContextRetriever } from '../types'
import type { RetrievedContextResults } from './completions-context-ranker'
import { JaccardSimilarityRetriever } from './retrievers/jaccard-similarity/jaccard-similarity-retriever'
import { DiagnosticsRetriever } from './retrievers/recent-user-actions/diagnostics-retriever'
import { RecentCopyRetriever } from './retrievers/recent-user-actions/recent-copy'
import { RecentEditsRetriever } from './retrievers/recent-user-actions/recent-edits-retriever'
import { RecentViewPortRetriever } from './retrievers/recent-user-actions/recent-view-port'
import { RetrieverIdentifier } from './utils'

interface RetrieverConfig {
    identifier: RetrieverIdentifier
    maxSnippets: number
}

export class ContextRetrieverDataCollection implements vscode.Disposable {
    public dataCollectionRetrievers: ContextRetriever[] = []
    private disposables: vscode.Disposable[] = []
    private static readonly MAX_PAYLOAD_SIZE_BYTES = 1024 * 1024 // 1 MB
    private dataCollectionFlagState = false
    private gitMetadataInstance = GitHubDotComRepoMetadata.getInstance()

    private readonly retrieverConfigs: RetrieverConfig[] = [
        { identifier: RetrieverIdentifier.RecentCopyRetriever, maxSnippets: 1 },
        { identifier: RetrieverIdentifier.RecentEditsRetriever, maxSnippets: 15 },
        { identifier: RetrieverIdentifier.DiagnosticsRetriever, maxSnippets: 15 },
        { identifier: RetrieverIdentifier.RecentViewPortRetriever, maxSnippets: 10 },
        { identifier: RetrieverIdentifier.JaccardSimilarityRetriever, maxSnippets: 15 },
    ]

    constructor() {
        this.disposables.push(
            subscriptionDisposable(
                completionProviderConfig.completionDataCollectionFlag.subscribe(
                    this.manageDataCollectionRetrievers.bind(this)
                )
            )
        )
    }

    private manageDataCollectionRetrievers(dataCollectionEnabled: boolean): void {
        if (this.dataCollectionFlagState === dataCollectionEnabled) {
            return
        }

        this.dataCollectionFlagState = dataCollectionEnabled
        this.disposeDataCollectionRetrievers()

        if (dataCollectionEnabled) {
            this.dataCollectionRetrievers = this.retrieverConfigs
                .map(this.createRetriever)
                .filter(isDefined)
        }
    }

    public getDataLoggingContextFromRetrievers(
        results: ReadonlyArray<RetrievedContextResults>
    ): AutocompleteContextSnippet[] {
        const identifierToResults = new Map(
            results.map(result => [result.identifier, [...result.snippets]])
        )

        const dataLoggingContext: AutocompleteContextSnippet[] = []
        let currentPayloadSizeBytes = 0

        for (const config of this.retrieverConfigs) {
            const snippets = identifierToResults.get(config.identifier)?.slice(0, config.maxSnippets)

            if (snippets) {
                for (const snippet of snippets) {
                    const snippetSizeBytes = Buffer.byteLength(JSON.stringify(snippet) || '', 'utf8')
                    if (
                        snippetSizeBytes > 0 &&
                        currentPayloadSizeBytes + snippetSizeBytes <=
                            ContextRetrieverDataCollection.MAX_PAYLOAD_SIZE_BYTES
                    ) {
                        dataLoggingContext.push(snippet)
                        currentPayloadSizeBytes += snippetSizeBytes
                    }
                }
            }
        }

        return dataLoggingContext
    }

    public shouldCollectContextDatapoint(repoName: string | undefined): boolean {
        if (!repoName || !isDotComAuthed() || this.dataCollectionRetrievers.length === 0) {
            return false
        }
        const gitRepoMetadata = this.gitMetadataInstance.getRepoMetadataIfCached(repoName)
        return gitRepoMetadata?.isPublic ?? false
    }

    private createRetriever(config: RetrieverConfig): ContextRetriever | undefined {
        switch (config.identifier) {
            case RetrieverIdentifier.RecentEditsRetriever:
                return new RecentEditsRetriever(10 * 60 * 1000)
            case RetrieverIdentifier.DiagnosticsRetriever:
                return new DiagnosticsRetriever()
            case RetrieverIdentifier.RecentViewPortRetriever:
                return new RecentViewPortRetriever({
                    maxTrackedViewPorts: 50,
                    maxRetrievedViewPorts: 10,
                })
            case RetrieverIdentifier.RecentCopyRetriever:
                return new RecentCopyRetriever({
                    maxAgeMs: 60 * 1000,
                    maxSelections: 100,
                })
            case RetrieverIdentifier.JaccardSimilarityRetriever:
                return new JaccardSimilarityRetriever()
            default:
                logDebug(
                    'ContextRetrieverDataCollection',
                    'createRetriever',
                    `Unhandled RetrieverIdentifier: ${config.identifier}`
                )
                return undefined
        }
    }

    private disposeDataCollectionRetrievers(): void {
        for (const retriever of this.dataCollectionRetrievers) {
            retriever.dispose()
        }
        this.dataCollectionRetrievers = []
    }

    public dispose(): void {
        this.disposeDataCollectionRetrievers()
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
