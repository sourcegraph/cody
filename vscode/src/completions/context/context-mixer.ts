import type * as vscode from 'vscode'

import {
    type AutocompleteContextSnippet,
    type DocumentContext,
    contextFiltersProvider,
    dedupeWith,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { autoeditsOutputChannelLogger } from '../../autoedits/output-channel-logger'
import type { LastInlineCompletionCandidate } from '../get-inline-completions'
import type { ContextRetriever } from '../types'
import {
    DefaultCompletionsContextRanker,
    type RetrievedContextResults,
} from './completions-context-ranker'
import type { ContextRankingStrategy } from './completions-context-ranker'
import { ContextRetrieverDataCollection } from './context-data-logging'
import type { ContextStrategy, ContextStrategyFactory } from './context-strategy'

interface GetContextOptions {
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    abortSignal?: AbortSignal
    maxChars: number
    lastCandidate?: LastInlineCompletionCandidate
    repoName?: string
}

export interface RetrieverStat {
    /** Name of the retriever */
    name: string
    /** Number of items that are ended up being suggested to be used by the context mixer */
    suggestedItems: number
    /** Number of total snippets */
    retrievedItems: number
    /** Number of characters in the suggested Items from the retriever */
    retrieverChars: number
    /** Duration of the individual retriever */
    duration: number
    /**
     * A bitmap that indicates at which position in the result set an entry from the given
     * retriever is included. It only includes information about the first 32 entries.
     *
     * The lowest bit indicates if the first entry is included, the second lowest bit
     * indicates if the second entry is included, and so on.
     */
    positionBitmap: number
}

export interface ContextSummary {
    /** Name of the strategy being used */
    strategy: ContextStrategy
    /** Total duration of the context retrieval phase */
    duration: number
    /** Total characters of combined context snippets */
    totalChars: number
    /** The number of characters in the prompt used from the document prefix. */
    prefixChars: number
    /** The number of characters in the prompt used from the document suffix. */
    suffixChars: number
    /** Detailed information for each retriever that has run */
    retrieverStats: RetrieverStat[]
}

export interface GetContextResult {
    context: AutocompleteContextSnippet[]
    contextSummary: ContextSummary
    contextLoggingSnippets: AutocompleteContextSnippet[]
}

interface ContextMixerOptions {
    strategyFactory: ContextStrategyFactory
    contextRankingStrategy: ContextRankingStrategy
    dataCollectionEnabled?: boolean
}

/**
 * The context mixer is responsible for combining multiple context retrieval strategies into a
 * single proposed context list.
 *
 * This is done by ranking the order of documents using reciprocal rank fusion and then combining
 * the snippets from each retriever into a single list using top-k (so we will pick all returned
 * ranged for the top ranked document from all retrieval sources before we move on to the second
 * document).
 */
export class ContextMixer implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private contextDataCollector: ContextRetrieverDataCollection | null = null
    private strategyFactory: ContextStrategyFactory
    private contextRankingStrategy: ContextRankingStrategy

    constructor({
        strategyFactory,
        contextRankingStrategy,
        dataCollectionEnabled = false,
    }: ContextMixerOptions) {
        this.strategyFactory = strategyFactory
        this.contextRankingStrategy = contextRankingStrategy
        if (dataCollectionEnabled) {
            this.contextDataCollector = new ContextRetrieverDataCollection()
            this.disposables.push(this.contextDataCollector)
        }
    }

    public async getContext(options: GetContextOptions): Promise<GetContextResult> {
        const start = performance.now()

        const { name: strategy, retrievers } = await this.strategyFactory.getStrategy(options.document)
        const retrieversWithDataLogging = this.maybeAddDataLoggingRetrievers(retrievers)

        if (retrieversWithDataLogging.length === 0) {
            return {
                context: [],
                contextSummary: {
                    strategy: 'none',
                    totalChars: options.docContext.prefix.length + options.docContext.suffix.length,
                    prefixChars: options.docContext.prefix.length,
                    suffixChars: options.docContext.suffix.length,
                    duration: 0,
                    retrieverStats: [],
                },
                contextLoggingSnippets: [],
            }
        }

        const resultsWithDataLogging: RetrievedContextResults[] = await Promise.all(
            retrieversWithDataLogging.map(async retriever => {
                const retrieverStart = performance.now()
                const allSnippets = await wrapInActiveSpan(
                    `autocomplete.retrieve.${retriever.identifier}`,
                    () =>
                        retriever.retrieve({
                            ...options,
                            hints: {
                                maxChars: options.maxChars,
                                maxMs: 150,
                            },
                        })
                )

                const filteredSnippets = await filter(allSnippets)

                return {
                    identifier: retriever.identifier,
                    duration: performance.now() - retrieverStart,
                    snippets: new Set(filteredSnippets),
                }
            })
        )

        // Extract back the context results for the original retrievers
        const results = this.extractOriginalRetrieverResults(resultsWithDataLogging, retrievers)
        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'ContextMixer',
            `Extracted ${results.length} contexts from the retrievers`
        )

        const contextLoggingSnippets =
            this.contextDataCollector?.getDataLoggingContextFromRetrievers(resultsWithDataLogging) ?? []

        // Original retrievers were 'none'
        if (results.length === 0) {
            return {
                context: [],
                contextSummary: {
                    strategy: 'none',
                    totalChars: options.docContext.prefix.length + options.docContext.suffix.length,
                    prefixChars: options.docContext.prefix.length,
                    suffixChars: options.docContext.suffix.length,
                    duration: 0,
                    retrieverStats: [],
                },
                contextLoggingSnippets,
            }
        }

        autoeditsOutputChannelLogger.logDebugIfVerbose(
            'ContextMixer',
            `Fusing ${results.length} context results with ${this.contextRankingStrategy}`
        )
        const contextRanker = new DefaultCompletionsContextRanker(this.contextRankingStrategy)
        const fusedResults = contextRanker.rankAndFuseContext(results)
        autoeditsOutputChannelLogger.logDebugIfVerbose('ContextMixer', 'Fused context results')

        // The total chars size hint is inclusive of the prefix and suffix sizes, so we seed the
        // total chars with the prefix and suffix sizes.
        let totalChars = options.docContext.prefix.length + options.docContext.suffix.length

        const mixedContext: AutocompleteContextSnippet[] = []
        const retrieverStats: ContextSummary['retrieverStats'] = []
        let position = 0
        for (const snippet of fusedResults) {
            if (totalChars + snippet.content.length > options.maxChars) {
                continue
            }

            mixedContext.push(snippet)
            totalChars += snippet.content.length

            // For analytics purposes, find out which retriever has yielded this result and
            // summarize the stats in retrieverStats.
            const retrieverId = results.find(r => r.snippets.has(snippet))?.identifier
            if (retrieverId) {
                let stat = retrieverStats.find(stat => stat.name === retrieverId)
                if (!stat) {
                    stat = {
                        name: retrieverId,
                        suggestedItems: 0,
                        positionBitmap: 0,
                        retrieverChars: 0,
                        retrievedItems:
                            results.find(r => r.identifier === retrieverId)?.snippets.size ?? 0,
                        duration: results.find(r => r.identifier === retrieverId)?.duration ?? 0,
                    }
                    retrieverStats.push(stat)
                }
                stat.retrieverChars += snippet.content.length
                stat.suggestedItems++
                // Only log the position for the first 32 results to avoid overflowing the bitmap
                if (position < 32) {
                    stat.positionBitmap |= 1 << position
                }
            }

            position++
        }

        const contextSummary: ContextSummary = {
            strategy,
            duration: performance.now() - start,
            totalChars,
            prefixChars: options.docContext.prefix.length,
            suffixChars: options.docContext.suffix.length,
            retrieverStats,
        }

        return {
            context: mixedContext,
            contextSummary,
            contextLoggingSnippets,
        }
    }

    private extractOriginalRetrieverResults(
        resultsWithDataLogging: RetrievedContextResults[],
        originalRetrievers: ContextRetriever[]
    ): RetrievedContextResults[] {
        const originalIdentifiers = new Set(originalRetrievers.map(r => r.identifier))
        return resultsWithDataLogging.filter(result => originalIdentifiers.has(result.identifier))
    }

    private maybeAddDataLoggingRetrievers(originalRetrievers: ContextRetriever[]): ContextRetriever[] {
        const dataCollectionRetrievers = this.getDataCollectionRetrievers()
        const combinedRetrievers = [...originalRetrievers, ...dataCollectionRetrievers]
        return dedupeWith(combinedRetrievers, 'identifier')
    }

    private getDataCollectionRetrievers(): ContextRetriever[] {
        if (!this.contextDataCollector?.shouldCollectContextDatapoint()) {
            return []
        }
        return this.contextDataCollector.dataCollectionRetrievers
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}

async function filter(snippets: AutocompleteContextSnippet[]): Promise<AutocompleteContextSnippet[]> {
    return (
        await Promise.all(
            snippets.map(async snippet => {
                if (await contextFiltersProvider.isUriIgnored(snippet.uri)) {
                    return null
                }
                return snippet
            })
        )
    ).filter((snippet): snippet is AutocompleteContextSnippet => snippet !== null)
}
