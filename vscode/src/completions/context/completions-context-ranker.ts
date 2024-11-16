import type { AutocompleteContextSnippet } from '@sourcegraph/cody-shared'
import { fuseResults } from './reciprocal-rank-fusion'

export enum ContextRankingStrategy {
    /**
     * Default strategy for ranking which uses RRF
     */
    Default = 'default',
    /**
     * Strategy that does not apply any ranking to context snippets
     */
    NoRanker = 'no-ranker',
}

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
    constructor(private readonly contextRankingStrategy: ContextRankingStrategy) {}

    public rankAndFuseContext(results: RetrievedContextResults[]): Set<AutocompleteContextSnippet> {
        switch (this.contextRankingStrategy) {
            case ContextRankingStrategy.NoRanker:
                return this.getContextSnippetsAsPerNoRankerStrategy(results)
            default:
                return this.getContextSnippetsAsPerDefaultStrategy(results)
        }
    }

    private getContextSnippetsAsPerNoRankerStrategy(
        results: RetrievedContextResults[]
    ): Set<AutocompleteContextSnippet> {
        const snippets = results.flatMap(r => [...r.snippets])
        return new Set(snippets)
    }

    private getContextSnippetsAsPerDefaultStrategy(
        results: RetrievedContextResults[]
    ): Set<AutocompleteContextSnippet> {
        if (this.containsRecentEditsBasedContext(results)) {
            return this.getRecentEditsBasedContextFusion(results)
        }
        return this.getRRFBasedContextFusion(results)
    }

    private containsRecentEditsBasedContext(results: RetrievedContextResults[]): boolean {
        return results.some(result => result.identifier.includes('recent-edits'))
    }

    private getRecentEditsBasedContextFusion(
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
    private splitPriorityBasedContextFusion(
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

    private getRRFBasedContextFusion(
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

    private getLinearContextFusion(results: RetrievedContextResults[]): Set<AutocompleteContextSnippet> {
        const linearResults = []
        for (const result of results) {
            linearResults.push(...Array.from(result.snippets))
        }
        return new Set(linearResults)
    }
}
