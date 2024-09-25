import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import { fuseResults } from './reciprocal-rank-fusion'

export interface RetrievedContextResults {
    identifier: string
    duration: number
    snippets: Set<AutocompleteContextSnippet>
}

interface CompletionsContextRanker {
    rankAndFuseContext(results: RetrievedContextResults[]): Set<AutocompleteContextSnippet>
}

interface PriorityBasedContextSnippets {
    priorityContext: RetrievedContextResults[]
    nonPriorityContext: RetrievedContextResults[]
}

export class DefaultCompletionsContextRanker implements CompletionsContextRanker {
    public rankAndFuseContext(results: RetrievedContextResults[]): Set<AutocompleteContextSnippet> {
        if (this.containsRecentEditsBasedContext(results)) {
            return this.getRecentEditsBasedContextFusion(results)
        }
        return this.getRRFBasedContextFusion(results)
    }

    public containsRecentEditsBasedContext(results: RetrievedContextResults[]): boolean {
        return results.some(result => result.identifier.includes('recent-edits'))
    }

    public getRecentEditsBasedContextFusion(
        results: RetrievedContextResults[]
    ): Set<AutocompleteContextSnippet> {
        // Maintains the recent-edit priority, while using RRF based fusion for rest of the context retrievers.
        const priorityBasedContextSnippets = this.splitPriorityBasedContextFusion(results, [
            'recent-edits',
        ])
        const priorityContextSnippets = this.getLinearContextFusion(
            priorityBasedContextSnippets.priorityContext
        )
        const nonPriorityContextSnippets = this.getRRFBasedContextFusion(
            priorityBasedContextSnippets.nonPriorityContext
        )

        return new Set([...priorityContextSnippets, ...nonPriorityContextSnippets])
    }

    /**
     * Performs a split based on priority based retrievers and orders the the priority based retrievers based on the order of the retrieverPriority array.
     *
     * @param results - An array of RetrievedContextResults to be split.
     * @param retrieverPriority - An ordered array of strings representing priority retrievers. Rest of the retrievers are ranked using RRF.
     * @returns A seperate set of priority based and non-priority based context snippets.
     */
    public splitPriorityBasedContextFusion(
        results: RetrievedContextResults[],
        retrieverPriority: string[]
    ): PriorityBasedContextSnippets {
        const priorityBasedRetrievedContext = results.filter(result =>
            retrieverPriority.includes(result.identifier)
        )
        const nonPriorityBasedRetrievedContext = results.filter(
            result => !retrieverPriority.includes(result.identifier)
        )

        const priorityMap = new Map(retrieverPriority.map((priority, index) => [priority, index]))
        const orderedPriorityBasedRetrievedContext = priorityBasedRetrievedContext.sort(
            (a, b) => priorityMap.get(a.identifier)! - priorityMap.get(b.identifier)!
        )

        return {
            priorityContext: orderedPriorityBasedRetrievedContext,
            nonPriorityContext: nonPriorityBasedRetrievedContext,
        }
    }

    public getRRFBasedContextFusion(
        results: RetrievedContextResults[]
    ): Set<AutocompleteContextSnippet> {
        const fusedResults = fuseResults(
            results.map(r => r.snippets),
            result => {
                // Ensure that context retrieved works when we do not have a startLine and
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
        return fusedResults
    }

    public getLinearContextFusion(results: RetrievedContextResults[]): Set<AutocompleteContextSnippet> {
        const linearResults = []
        for (const result of results) {
            linearResults.push(...Array.from(result.snippets))
        }
        return new Set(linearResults)
    }
}
