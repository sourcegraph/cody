import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { logDebug } from '../../log'
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
    private readonly retrieverConfigs: ReadonlyArray<RetrieverConfig>
    private readonly dataCollectionRetrievers: ReadonlyArray<ContextRetriever>
    private disposables: vscode.Disposable[] = []
    private static readonly MAX_PAYLOAD_SIZE_BYTES = 1024 * 1024 // 1 MB

    constructor() {
        this.retrieverConfigs = [
            { identifier: RetrieverIdentifier.RecentCopyRetriever, maxSnippets: 1 },
            { identifier: RetrieverIdentifier.RecentEditsRetriever, maxSnippets: 15 },
            { identifier: RetrieverIdentifier.DiagnosticsRetriever, maxSnippets: 15 },
            { identifier: RetrieverIdentifier.RecentViewPortRetriever, maxSnippets: 10 },
            { identifier: RetrieverIdentifier.JaccardSimilarityRetriever, maxSnippets: 15 },
        ]
        this.dataCollectionRetrievers = this.retrieverConfigs
            .map(config => this.createRetriever(config))
            .filter((retriever): retriever is ContextRetriever => retriever !== undefined)

        this.disposables = this.dataCollectionRetrievers.slice()
    }

    public getRetrievers(): ReadonlyArray<ContextRetriever> {
        return this.dataCollectionRetrievers
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

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
