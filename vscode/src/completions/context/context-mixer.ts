import type * as vscode from 'vscode'

import { isCodyIgnoredFile, wrapInActiveSpan } from '@sourcegraph/cody-shared'

import type { DocumentContext } from '../get-current-doc-context'
import type { ContextSnippet } from '../types'

import type { ContextStrategy, ContextStrategyFactory } from './context-strategy'
import { fuseResults } from './reciprocal-rank-fusion'

interface GetContextOptions {
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    abortSignal?: AbortSignal
    maxChars: number
}

export interface ContextSummary {
    /** Name of the strategy being used */
    strategy: ContextStrategy
    /** Total duration of the context retrieval phase */
    duration: number
    /** Total characters of combined context snippets */
    totalChars: number
    /** Detailed information for each retriever that has run */
    retrieverStats: {
        [identifier: string]: {
            /** Number of items that are ended up being suggested to be used by the context mixer */
            suggestedItems: number
            /** Number of total snippets */
            retrievedItems: number
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
    context: ContextSnippet[]
    logSummary: ContextSummary
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
    constructor(private strategyFactory: ContextStrategyFactory) {}

    public async getContext(options: GetContextOptions): Promise<GetContextResult> {
        const start = performance.now()

        const { name: strategy, retrievers } = this.strategyFactory.getStrategy(options.document)
        if (retrievers.length === 0) {
            return {
                context: [],
                logSummary: {
                    strategy: 'none',
                    totalChars: 0,
                    duration: 0,
                    retrieverStats: {},
                },
            }
        }

        const results = await Promise.all(
            retrievers.map(async retriever => {
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
                const filteredSnippets = allSnippets.filter(snippet => !isCodyIgnoredFile(snippet.uri))

                return {
                    identifier: retriever.identifier,
                    duration: performance.now() - retrieverStart,
                    snippets: new Set(filteredSnippets),
                }
            })
        )

        const fusedResults = fuseResults(
            results.map(r => r.snippets),
            result => {
                // Ensure that context retrieved via BFG works where we do not have a startLine and
                // endLine yet.
                if (typeof result.startLine === 'undefined' || typeof result.endLine === 'undefined') {
                    return [result.uri.toString()]
                }

                const lineIds = []
                for (let i = result.startLine; i <= result.endLine; i++) {
                    lineIds.push(`${result.uri.toString()}:${i}`)
                }
                return lineIds
            }
        )

        // The total chars size hint is inclusive of the prefix and suffix sizes, so we seed the
        // total chars with the prefix and suffix sizes.
        let totalChars = options.docContext.prefix.length + options.docContext.suffix.length

        const mixedContext: ContextSnippet[] = []
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
                        retrievedItems:
                            results.find(r => r.identifier === retrieverId)?.snippets.size ?? 0,
                        duration: results.find(r => r.identifier === retrieverId)?.duration ?? 0,
                    }
                }
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
            retrieverStats,
        }

        return {
            context: mixedContext,
            logSummary,
        }
    }

    public dispose(): void {
        this.strategyFactory.dispose()
    }
}
