import * as vscode from 'vscode'

import { DocumentContext } from '../get-current-doc-context'
import { ContextSnippet } from '../types'

import { JaccardSimilarityRetriever } from './retrievers/jaccard-similarity/jaccard-similarity-retriever'

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
    public jaccardSimilarityRetriever = new JaccardSimilarityRetriever()

    public async getContext(options: GetContextOptions): Promise<GetContextResult> {
        //     const graphContext = await getContextFromGraph(options)
        //     // When we have graph matches, use it exclusively for the context
        //     // TODO(philipp-spiess): Do we want to mix this with local context?
        //     if (graphContext) {
        //         return graphContext
        //     }

        const { maxChars } = options
        const start = performance.now()

        const localMatches = await this.jaccardSimilarityRetriever.retrieve({
            ...options,
            hints: {
                maxChars: options.maxChars,
                maxMs: 150,
            },
        })

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

    public dispose(): void {
        this.jaccardSimilarityRetriever.dispose()
    }
}
