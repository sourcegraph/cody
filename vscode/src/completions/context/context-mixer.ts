import * as vscode from 'vscode'

import { DocumentContext } from '../get-current-doc-context'
import { ContextRetriever, ContextSnippet } from '../types'

import { BfgRetriever } from './retrievers/bfg/bfg-retriever'
import { JaccardSimilarityRetriever } from './retrievers/jaccard-similarity/jaccard-similarity-retriever'
import { LspLightRetriever } from './retrievers/lsp-light/lsp-light-retriever'
import { SectionHistoryRetriever } from './retrievers/section-history/section-history-retriever'

export interface GetContextOptions {
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

export type ContextStrategy = 'lsp-light' | 'bfg' | 'jaccard-similarity' | 'none'
export class ContextMixer implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    private localRetriever: ContextRetriever | undefined
    private graphRetriever: ContextRetriever | undefined

    constructor(
        private contextStrategy: ContextStrategy,
        createBfgRetriever?: () => BfgRetriever
    ) {
        switch (contextStrategy) {
            case 'none':
                break
            case 'bfg':
                // The bfg strategy uses jaccard similarity as a fallback if no results are found or
                // the language is not supported.
                this.localRetriever = new JaccardSimilarityRetriever()
                this.disposables.push(this.localRetriever)
                if (createBfgRetriever) {
                    this.graphRetriever = createBfgRetriever()
                    this.disposables.push(this.graphRetriever)
                }
                break
            case 'lsp-light':
                this.localRetriever = SectionHistoryRetriever.createInstance()
                this.graphRetriever = new LspLightRetriever()
                this.disposables.push(this.localRetriever, this.graphRetriever)
                break
            case 'jaccard-similarity':
                this.localRetriever = new JaccardSimilarityRetriever()
                this.disposables.push(this.localRetriever)
                break
        }
    }

    public async getContext(options: GetContextOptions): Promise<GetContextResult> {
        const retrievers: ContextRetriever[] = []

        const start = performance.now()

        switch (this.contextStrategy) {
            case 'none': {
                break
            }

            // The lsp-light strategy mixes local and graph based retrievers
            case 'lsp-light': {
                if (this.graphRetriever && this.graphRetriever.isSupportedForLanguageId(options.document.languageId)) {
                    retrievers.push(this.graphRetriever)
                }
                if (this.localRetriever) {
                    retrievers.push(this.localRetriever)
                }
                break
            }

            // The bfg strategy only uses the graph based retriever and falls through to the local
            // retriever if the graph based retriever is not available for the requested language.
            case 'bfg':
                if (this.graphRetriever && this.graphRetriever.isSupportedForLanguageId(options.document.languageId)) {
                    retrievers.push(this.graphRetriever)
                    break
                }

            case 'jaccard-similarity': {
                if (this.localRetriever) {
                    retrievers.push(this.localRetriever)
                }
                break
            }
        }

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
                const snippets = await retriever.retrieve({
                    ...options,
                    hints: {
                        maxChars: options.maxChars,
                        maxMs: 150,
                    },
                })

                return {
                    identifier: retriever.identifier,
                    duration: performance.now() - retrieverStart,
                    snippets,
                }
            })
        )

        const mixedContext: ContextSnippet[] = []
        const retrieverStats: ContextSummary['retrieverStats'] = {}

        const maxMatches = Math.max(...[...results.values()].map(r => r.snippets.length))

        let totalChars = 0
        let position = 0
        for (let i = 0; i < maxMatches; i++) {
            for (const { identifier, duration, snippets } of results) {
                if (i >= snippets.length) {
                    continue
                }
                const snippet = snippets[i]
                if (totalChars + snippet.content.length > options.maxChars) {
                    continue
                }

                mixedContext.push(snippet)
                totalChars += snippet.content.length

                if (!retrieverStats[identifier]) {
                    retrieverStats[identifier] = {
                        suggestedItems: 0,
                        positionBitmap: 0,
                        retrievedItems: snippets.length ?? 0,
                        duration,
                    }
                }

                retrieverStats[identifier].suggestedItems++
                if (position < 32) {
                    retrieverStats[identifier].positionBitmap |= 1 << position
                }

                position++
            }
        }

        const logSummary: ContextSummary = {
            strategy: this.contextStrategy,
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
        this.disposables.forEach(disposable => disposable.dispose())
    }
}
