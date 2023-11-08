import * as vscode from 'vscode'

import { BfgRetriever } from '../../graph/bfg/BfgContextFetcher'
import { logDebug } from '../../log'
import { DocumentContext } from '../get-current-doc-context'
import { ContextRetriever, ContextSnippet } from '../types'

import { JaccardSimilarityRetriever } from './retrievers/jaccard-similarity/jaccard-similarity-retriever'
import { LspLightGraphCache } from './retrievers/lsp-light/lsp-light-graph-cache'

export interface GetContextOptions {
    document: vscode.TextDocument
    position: vscode.Position
    docContext: DocumentContext
    abortSignal?: AbortSignal
    maxChars: number
}

export type ContextSummary = Readonly<{
    strategy: string
    embeddings?: number
    local?: number
    graph?: number
    duration: number
}>

export interface GetContextResult {
    context: ContextSnippet[]
    logSummary: ContextSummary
}

export class ContextMixer implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []

    private localRetriever: ContextRetriever | undefined
    private graphRetriever: ContextRetriever | undefined

    constructor(
        contextStrategy: 'lsp-light' | 'bfg' | 'jaccard-similarity' | 'none',
        createBfgRetriever?: () => BfgRetriever
    ) {
        if (contextStrategy !== 'none') {
            this.localRetriever = new JaccardSimilarityRetriever()
            this.disposables.push(this.localRetriever)
        }

        if (contextStrategy === 'bfg' && createBfgRetriever) {
            this.graphRetriever = createBfgRetriever()
            this.disposables.push(this.graphRetriever)
        } else if (contextStrategy === 'lsp-light') {
            this.graphRetriever = LspLightGraphCache.createInstance()
            this.disposables.push(this.graphRetriever)
        }
    }

    // TODO: Generalize the retriever concept more. For now we branch off based on graph context
    // usage or not to support the existing configuration options
    public async getContext(options: GetContextOptions): Promise<GetContextResult> {
        if (this.graphRetriever && this.graphRetriever.isSupportedForLanguageId(options.document.languageId)) {
            return this.getGraphContext(options)
        }
        return this.getLocalContext(options)
    }

    public async getLocalContext(options: GetContextOptions): Promise<GetContextResult> {
        const { maxChars } = options
        const start = performance.now()

        const localMatches =
            (await this.localRetriever?.retrieve({
                ...options,
                hints: {
                    maxChars: options.maxChars,
                    maxMs: 150,
                },
            })) ?? []

        /**
         * Iterate over matches and add them to the context.
         * Discard editor matches for files with embedding matches.
         */
        const usedFilenames = new Set<string>()
        const context: ContextSnippet[] = []
        let totalChars = 0
        function addMatch(match: ContextSnippet): boolean {
            // TODO(@philipp-spiess): We should de-dupe on the snippet range and not
            // the file name to allow for more than one snippet of the same file
            if (usedFilenames.has(match.fileName)) {
                return false
            }
            usedFilenames.add(match.fileName)

            if (totalChars + match.content.length > maxChars) {
                return false
            }
            context.push(match)
            totalChars += match.content.length
            return true
        }

        let includedLocalMatches = 0
        for (const match of localMatches) {
            if (addMatch(match)) {
                includedLocalMatches++
            }
        }

        return {
            context,
            logSummary: {
                strategy: 'local',
                ...(includedLocalMatches ? { local: includedLocalMatches } : {}),
                duration: performance.now() - start,
            },
        }
    }

    public async getGraphContext(options: GetContextOptions): Promise<GetContextResult> {
        const retriever = this.graphRetriever

        if (!retriever) {
            throw new Error('getGraphContext called with undefined graph retriever')
        }

        const start = performance.now()
        const graphMatches = await retriever.retrieve({
            ...options,
            hints: {
                maxChars: options.maxChars,
                maxMs: 150,
            },
        })

        // TODO: Run local and graph retrievers in parallel and mix the results
        if (graphMatches.length <= 0) {
            return this.getLocalContext(options)
        }

        const context: ContextSnippet[] = []
        let totalChars = 0
        let includedGraphMatches = 0
        for (const match of graphMatches) {
            if (totalChars + match.content.length > options.maxChars) {
                continue
            }
            context.push(match)
            totalChars += match.content.length
            includedGraphMatches++
        }

        logDebug(
            'GraphContext:autocomplete',
            `Added ${includedGraphMatches} graph matches for ${options.document.fileName}`,
            { verbose: graphMatches }
        )

        return {
            context,
            logSummary: {
                strategy: retriever.identifier,
                graph: includedGraphMatches,
                duration: performance.now() - start,
            },
        }
    }
    public dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose())
    }
}
