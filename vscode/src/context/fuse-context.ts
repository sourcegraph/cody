// k parameter for the reciprocal rank fusion scoring. 60 is the default value in many places
//
// c.f. https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking#how-rrf-ranking-works
const RRF_K = 60

/**
 * Implements a basic variant of reciprocal rank fusion to combine context items from various
 * retrievers into one result set.
 *
 * Since the definition of documents can vary across the consumers, a rankingIdentity function
 * needs to be implemented that returns a string representation for the document.
 *
 * @param searchContext
 * @returns
 */
export function fuseContext<T>(retrievers: T[][], rankingIdentity: (item: T) => string): T[] {
    // For every retrieved result set, create a map of context items by document.
    const resultsByDocument = new Map<string, Map<number, T[]>>()
    retrievers.forEach((items, retrieverIndex) => {
        for (const item of items) {
            const documentId = rankingIdentity(item)

            let document = resultsByDocument.get(documentId)
            if (!document) {
                document = new Map()
                resultsByDocument.set(documentId, document)
            }
            if (!document.has(retrieverIndex)) {
                document.set(retrieverIndex, [])
            }

            document.get(retrieverIndex)!.push(item)
        }
    })

    // Rank the order of documents using reciprocal rank fusion.
    //
    // For this, we take the top rank of every document from each retrieved set and compute a
    // combined rank. The idea is that a document that ranks highly across multiple retrievers
    // should be ranked higher overall.
    const fusedDocumentScores: Map<string, number> = new Map()
    retrievers.forEach((items, retrieverIndex) => {
        items.forEach((item, rank) => {
            const documentId = rankingIdentity(item)

            // Since our retrievers do not have a unique definition of document, we need to handle
            // the case where a retriever returns the same document multiple times. In this case, we
            // only consider the best rank for each document.
            // We can use the previous map by document to find the highest ranked snippet for a
            // retriever
            const isBestRankForRetriever =
                resultsByDocument.get(documentId)?.get(retrieverIndex)?.[0] === item
            if (!isBestRankForRetriever) {
                return
            }

            const reciprocalRank = 1 / (RRF_K + rank)

            const score = fusedDocumentScores.get(documentId)
            if (score === undefined) {
                fusedDocumentScores.set(documentId, reciprocalRank)
            } else {
                fusedDocumentScores.set(documentId, score + reciprocalRank)
            }
        })
    })

    const fusedDocuments = [...fusedDocumentScores.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])

    const fusedContext: T[] = []
    // Now that we have a sorted list of documents (with the first document being the highest
    // ranked one), we use top-k to combine snippets from each retriever into a result set.
    //
    // We start with the highest ranked document and include all retrieved snippets from this
    // document into the result set, starting with the top retrieved snippet from each retriever
    // and adding entries greedily.
    for (const documentId of fusedDocuments) {
        const resultByDocument = resultsByDocument.get(documentId)
        if (!resultByDocument) {
            continue
        }

        // We want to start iterating over every retrievers first rank, then every retrievers
        // second rank etc. The termination criteria is thus defined to be the length of the
        // largest snippet list of any retriever.
        const maxMatches = Math.max(...[...resultByDocument.values()].map(r => r.length))

        for (let i = 0; i < maxMatches; i++) {
            for (const [_, snippets] of resultByDocument.entries()) {
                if (i >= snippets.length) {
                    continue
                }
                const snippet = snippets[i]

                fusedContext.push(snippet)
            }
        }
    }
    return fusedContext
}
