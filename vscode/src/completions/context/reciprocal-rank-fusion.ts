// k parameter for the reciprocal rank fusion scoring. 60 is the default value in many places
//
// c.f. https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking#how-rrf-ranking-works
const RRF_K = 60

/**
 * Implements a basic variant of reciprocal rank fusion to combine context items from various
 * retrievers into one result set.
 *
 * Since the definition of documents can vary across the consumers, a rankingIdentities function needs
 * to be implemented that returns a set of identifiers for a document. A set is used to support our
 * needs of varying context windows across Cody retrievers. In our case, these ranking identity
 * would yield one identifier for every line of code affected by a context window.
 *
 * When combining the top ranked documents, we will make sure that no item is added twice (as
 * denoted by their referential equality).
 *
 * For an example, consider two retrievers that return results of line ranges within a code file:
 *
 *   - Set 1: [foo.ts#20-25, foo.ts#1-5]
 *   - Set 2: [foo.ts#3-7]
 *
 * The ranking identity function can now generate unique identifiers for every row that is being
 * retrieved, so we end up having the following IDs in this example:
 *
 *   - foo.ts#20-25 => [foo.ts:20, foo.ts:21, foo.ts:22, foo.ts:23, foo.ts:24, foo.ts:25]
 *   - foo.ts#1-5   => [foo.ts:1, foo.ts:2, foo.ts:3, foo.ts:4, foo.ts:5]
 *   - foo.ts#3-7   => [foo.ts:3, foo.ts:3, foo.ts:4, foo.ts:5, foo.ts:6, foo.ts:7]
 *
 * Based on this expanded set of "documents", we now apply RRF and find overlaps at the following
 * places:
 *
 *  - [foo.ts:3 foo.ts:4, foo.ts:5]
 *
 * RRF will now boost the rank for these three lins and when we reconcile the result set, we
 * will start by picking all ranges that overlap with the first line.
 */
export function fuseResults<T>(
    retrievedSets: Set<T>[],
    rankingIdentities: (result: T) => string[]
): Set<T> {
    // For every retrieved result set, create a map of results by document.
    const resultsByDocument = new Map<string, Map<number, T[]>>()
    retrievedSets.forEach((results, retrieverIndex) => {
        for (const result of results) {
            for (const id of rankingIdentities(result)) {
                let document = resultsByDocument.get(id)
                if (!document) {
                    document = new Map()
                    resultsByDocument.set(id, document)
                }
                if (!document.has(retrieverIndex)) {
                    document.set(retrieverIndex, [])
                }

                document.get(retrieverIndex)!.push(result)
            }
        }
    })

    // Rank the order of documents using reciprocal rank fusion.
    //
    // For this, we take the top rank of every document from each retrieved set and compute a
    // combined rank. The idea is that a document that ranks highly across multiple retrievers
    // should be ranked higher overall.
    const fusedDocumentScores: Map<string, number> = new Map()
    retrievedSets.forEach((results, retrieverIndex) => {
        let i = 0
        for (const result of results) {
            const rank = i++
            for (const id of rankingIdentities(result)) {
                // There is no guarantee that retrievers do not have more than one result in the
                // same document (e.g. when the document definition is too broad). For these cases,
                // we only consider the best ranked result per document for each retriever. We can
                // use the previous map by document to find the highest ranked result for a
                // retriever very easily.
                const isBestRankForRetriever =
                    resultsByDocument.get(id)?.get(retrieverIndex)?.[0] === result
                if (!isBestRankForRetriever) {
                    return
                }

                const reciprocalRank = 1 / (RRF_K + rank)

                const score = fusedDocumentScores.get(id) ?? 0
                fusedDocumentScores.set(id, score + reciprocalRank)
            }
        }
    })

    const topDocuments = [...fusedDocumentScores.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])

    const fusedResults: Set<T> = new Set()
    // Now that we have a sorted list of documents (with the first document being the highest ranked
    // one), we combine results from each document and retriever into a result set.
    //
    // This is done greedily. Imagine a set of context snippets that have overlapping ranges. In the
    // previous logic we computed a rank for each overlapping line, giving us the line with the most
    // context ranges overlapping it on the first position. We then use this order and pack all
    // overlapping snippets into the result set while ensuring no result is added twice (guaranteed
    // by the set).
    for (const id of topDocuments) {
        const resultByDocument = resultsByDocument.get(id)
        if (!resultByDocument) {
            continue
        }

        // In case of multiple results being part of the same document, we want to start iterating
        // over every retrievers first rank, then every retrievers second rank etc. The termination
        // criteria is defined to be the length of the largest snippet list of any retriever.
        const maxMatches = Math.max(...[...resultByDocument.values()].map(r => r.length))

        for (let i = 0; i < maxMatches; i++) {
            for (const [_, snippets] of resultByDocument.entries()) {
                if (i >= snippets.length) {
                    continue
                }
                const snippet = snippets[i]

                fusedResults.add(snippet)
            }
        }
    }
    return fusedResults
}
