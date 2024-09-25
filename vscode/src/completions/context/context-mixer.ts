import type * as vscode from 'vscode'

import {
    type AutocompleteContextSnippet,
    type DocumentContext,
    contextFiltersProvider,
    subscriptionDisposable,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import { GitHubDotComRepoMetadata } from '../../repository/repo-metadata-from-git-api'
import { completionProviderConfig } from '../completion-provider-config'
import type { LastInlineCompletionCandidate } from '../get-inline-completions'
import type { ContextRetriever } from '../types'
import {
    DefaultCompletionsContextRanker,
    type RetrievedContextResults,
} from './completions-context-ranker'
import { ContextRetrieverDataCollection } from './context-data-logging'
import type { ContextStrategy, ContextStrategyFactory } from './context-strategy'

interface GetContextOptions {
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    abortSignal?: AbortSignal
    maxChars: number
    lastCandidate?: LastInlineCompletionCandidate
    gitUrl?: string
    isDotComUser?: boolean
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
    retrieverStats: {
        [identifier: string]: {
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
    }
}

export interface GetContextResult {
    context: AutocompleteContextSnippet[]
    logSummary: ContextSummary
    contextLoggingSnippets: AutocompleteContextSnippet[]
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
    private dataCollectionEnabled = false
    private contextDataCollector?: ContextRetrieverDataCollection

    constructor(private strategyFactory: ContextStrategyFactory) {
        this.disposables.push(
            subscriptionDisposable(
                completionProviderConfig.completionDataCollectionFlag.subscribe(dataCollectionFlag => {
                    this.manageContextDataCollector(dataCollectionFlag)
                })
            )
        )
    }

    private manageContextDataCollector(newDataCollectionFlag: boolean): void {
        if (this.dataCollectionEnabled === newDataCollectionFlag) {
            return
        }

        this.dataCollectionEnabled = newDataCollectionFlag

        if (newDataCollectionFlag && !this.contextDataCollector) {
            this.contextDataCollector = new ContextRetrieverDataCollection()
            this.disposables.push(this.contextDataCollector)
        } else if (!newDataCollectionFlag && this.contextDataCollector) {
            const index = this.disposables.indexOf(this.contextDataCollector)
            if (index !== -1) {
                this.disposables.splice(index, 1)
            }
            this.contextDataCollector.dispose()
            this.contextDataCollector = undefined
        }
    }
    public async getContext(options: GetContextOptions): Promise<GetContextResult> {
        const start = performance.now()

        const { name: strategy, retrievers } = await this.strategyFactory.getStrategy(options.document)
        const updatedRetrievers = this.getUpdatedRetrievers(
            options.gitUrl,
            options.isDotComUser,
            retrievers
        )

        if (updatedRetrievers.length === 0) {
            return {
                context: [],
                logSummary: {
                    strategy: 'none',
                    totalChars: options.docContext.prefix.length + options.docContext.suffix.length,
                    prefixChars: options.docContext.prefix.length,
                    suffixChars: options.docContext.suffix.length,
                    duration: 0,
                    retrieverStats: {},
                },
                contextLoggingSnippets: [],
            }
        }

        const updatedRetrieverResults: RetrievedContextResults[] = await Promise.all(
            updatedRetrievers.map(async retriever => {
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
        const results = this.extractOriginalRetrieverResults(updatedRetrieverResults, retrievers)
        const contextLoggingSnippets =
            this.contextDataCollector?.getDataLoggingContextFromRetrievers(updatedRetrieverResults) ?? []

        // Original retrievers were 'none'
        if (results.length === 0) {
            return {
                context: [],
                logSummary: {
                    strategy: 'none',
                    totalChars: options.docContext.prefix.length + options.docContext.suffix.length,
                    prefixChars: options.docContext.prefix.length,
                    suffixChars: options.docContext.suffix.length,
                    duration: 0,
                    retrieverStats: {},
                },
                contextLoggingSnippets,
            }
        }

        const contextRanker = new DefaultCompletionsContextRanker()
        const fusedResults = contextRanker.rankAndFuseContext(results)

        // The total chars size hint is inclusive of the prefix and suffix sizes, so we seed the
        // total chars with the prefix and suffix sizes.
        let totalChars = options.docContext.prefix.length + options.docContext.suffix.length

        const mixedContext: AutocompleteContextSnippet[] = []
        const retrieverStats: ContextSummary['retrieverStats'] = {}
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
                if (!retrieverStats[retrieverId]) {
                    retrieverStats[retrieverId] = {
                        suggestedItems: 0,
                        positionBitmap: 0,
                        retrieverChars: 0,
                        retrievedItems:
                            results.find(r => r.identifier === retrieverId)?.snippets.size ?? 0,
                        duration: results.find(r => r.identifier === retrieverId)?.duration ?? 0,
                    }
                }
                retrieverStats[retrieverId].retrieverChars += snippet.content.length
                retrieverStats[retrieverId].suggestedItems++
                // Only log the position for the first 32 results to avoid overflowing the bitmap
                if (position < 32) {
                    retrieverStats[retrieverId].positionBitmap |= 1 << position
                }
            }

            position++
        }

        const logSummary: ContextSummary = {
            strategy,
            duration: performance.now() - start,
            totalChars,
            prefixChars: options.docContext.prefix.length,
            suffixChars: options.docContext.suffix.length,
            retrieverStats,
        }

        return {
            context: mixedContext,
            logSummary,
            contextLoggingSnippets: contextLoggingSnippets,
        }
    }

    private extractOriginalRetrieverResults(
        updatedRetrieverResults: RetrievedContextResults[],
        originalRetrievers: ContextRetriever[]
    ): RetrievedContextResults[] {
        const originalIdentifiers = new Set(originalRetrievers.map(r => r.identifier))
        return updatedRetrieverResults.filter(result => originalIdentifiers.has(result.identifier))
    }

    private getUpdatedRetrievers(
        gitUrl: string | undefined,
        isDotComUser: boolean | undefined,
        originalRetrievers: ContextRetriever[]
    ): ContextRetriever[] {
        if (
            this.contextDataCollector === undefined ||
            !this.shouldCollectContextDatapoint(gitUrl, isDotComUser)
        ) {
            return originalRetrievers
        }
        const combinedRetrievers = new Map<string, ContextRetriever>()
        for (const retriever of this.contextDataCollector.getRetrievers()) {
            combinedRetrievers.set(retriever.identifier, retriever)
        }
        // Always give priority to the original retrievers
        for (const retriever of originalRetrievers) {
            combinedRetrievers.set(retriever.identifier, retriever)
        }
        return Array.from(combinedRetrievers.values())
    }

    private shouldCollectContextDatapoint(
        gitUrl: string | undefined,
        isDotComUser: boolean | undefined
    ): boolean {
        /**
         * Only collect the relevant datapoint if the request satisfies these conditions:
         * 1. If the current repo is a public github repo.
         * 2. If the user is a dotcom user.
         * 3. If the user is in data collection variant.
         */
        if (!gitUrl || !isDotComUser || !this.dataCollectionEnabled) {
            return false
        }
        const instance = GitHubDotComRepoMetadata.getInstance()
        const gitRepoMetadata = instance.getRepoMetadataIfCached(gitUrl)
        return gitRepoMetadata?.isPublic ?? false
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.contextDataCollector = undefined
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
