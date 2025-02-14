import {
    type AutocompleteContextSnippet,
    isDefined,
    isDotComAuthed,
    subscriptionDisposable,
} from '@sourcegraph/cody-shared'
import type * as vscode from 'vscode'
import { logDebug } from '../../output-channel-logger'
import { completionProviderConfig } from '../completion-provider-config'
import type { ContextRetriever } from '../types'
import type { RetrievedContextResults } from './completions-context-ranker'
import { JaccardSimilarityRetriever } from './retrievers/jaccard-similarity/jaccard-similarity-retriever'
import { DiagnosticsRetriever } from './retrievers/recent-user-actions/diagnostics-retriever'
import { RecentCopyRetriever } from './retrievers/recent-user-actions/recent-copy'
import { LineLevelDiffStrategy } from './retrievers/recent-user-actions/recent-edits-diff-helpers/line-level-diff'
import { RecentEditsRetriever } from './retrievers/recent-user-actions/recent-edits-retriever'
import { RecentViewPortRetriever } from './retrievers/recent-user-actions/recent-view-port'
import { RetrieverIdentifier } from './utils'

interface RetrieverConfig {
    identifier: RetrieverIdentifier
    maxSnippets?: number
}

export class ContextRetrieverDataCollection implements vscode.Disposable {
    public dataCollectionRetrievers: ContextRetriever[] = []
    private disposables: vscode.Disposable[] = []
    private static readonly MAX_PAYLOAD_SIZE_BYTES = 1024 * 1024 // 1 MB
    private dataCollectionFlagState = false

    private readonly retrieverConfigs: RetrieverConfig[] = [
        // Recent edits can be very granual at line level, so the individual changes can be very small but there can lots of changes.
        // So, we avoid the limit for recent edits, but the size is handled by the token limits.
        { identifier: RetrieverIdentifier.RecentEditsRetriever },
        { identifier: RetrieverIdentifier.DiagnosticsRetriever, maxSnippets: 15 },
        { identifier: RetrieverIdentifier.RecentViewPortRetriever, maxSnippets: 10 },
        { identifier: RetrieverIdentifier.RecentCopyRetriever, maxSnippets: 1 },
        // Jaccard similarity snippets are very large in general (with ~50 lines of code per snippet),
        // so we limit the number of snippets.
        { identifier: RetrieverIdentifier.JaccardSimilarityRetriever, maxSnippets: 3 },
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

    public shouldCollectContextDatapoint(): boolean {
        if (!isDotComAuthed() || this.dataCollectionRetrievers.length === 0) {
            return false
        }
        return true
    }

    private createRetriever(config: RetrieverConfig): ContextRetriever | undefined {
        switch (config.identifier) {
            case RetrieverIdentifier.RecentEditsRetriever:
                return new RecentEditsRetriever({
                    maxAgeMs: 10 * 60 * 1000,
                    diffStrategyList: [
                        // Use unified diff for long term changes, and line based diff for short term changes.
                        new LineLevelDiffStrategy({
                            contextLines: 3,
                            longTermDiffCombinationStrategy: 'unified-diff',
                            minShortTermEvents: 1,
                            minShortTermTimeMs: 2 * 60 * 1000, // 2 minutes,
                            trimSurroundingContext: false,
                        }),
                    ],
                })
            case RetrieverIdentifier.DiagnosticsRetriever:
                return new DiagnosticsRetriever({
                    contextLines: 0,
                    useXMLForPromptRendering: false,
                    useCaretToIndicateErrorLocation: false,
                })
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
