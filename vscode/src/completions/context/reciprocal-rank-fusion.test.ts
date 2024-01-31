import { describe, expect, it } from 'vitest'

import { fuseResults } from './reciprocal-rank-fusion'

describe('fuseResults', () => {
    it('fuses multiple context item lists into one ranked list', () => {
        // biome-ignore format: Make it clearly visible that there are two retrieved sets
        const retrievers = [
            new Set([{ id: 1 }, { id: 2 }]),
            new Set([{ id: 2 }, { id: 3 }]),
        ]
        const rankingIdentities = (item: { id: number }) => [item.id.toString()]

        const results = fuseResults(retrievers, rankingIdentities)

        // The first set has documents with IDs 1 and 2. The second set has documents with IDs 2 and 3.
        //
        // The document with ID 2 appears in both sets, making it more significant according to RRF.
        // Therefore, it gains a higher combined rank and appears first in the fused result.
        expect(results).toEqual(new Set([{ id: 2 }, { id: 2 }, { id: 1 }, { id: 3 }]))
    })

    it('handles one retriever returning the same document multiple times', () => {
        // biome-ignore format: Make it clearly visible that there are two retrieved sets
        const retrievers = [
            new Set([{ id: 1 }, { id: 2 }, { id: 2 }]),
            new Set([{ id: 2 }, { id: 3 }])
        ]
        const rankingIdentities = (item: { id: number }) => [item.id.toString()]

        const results = fuseResults(retrievers, rankingIdentities)

        expect(results).toEqual(new Set([{ id: 2 }, { id: 2 }, { id: 2 }, { id: 1 }, { id: 3 }]))
    })

    // Note: Dedupe here refers to the same result being added two times, we don't drop results that
    //       point to the same document ID. We `fuseResults` should always return the same number of
    //       results as the sum of all result sets.
    it('handles the same result being part of multiple documents without getting duplicated', () => {
        const retrievers = [
            new Set([
                { name: 'set1doc1', lines: [1, 2, 3, 4] },
                { name: 'set1doc2', lines: [7, 8] },
            ]),
            new Set([
                { name: 'set2doc1', lines: [1, 2] },
                { name: 'set2doc2', lines: [5, 6] },
            ]),
        ]
        const rankingIdentities = (item: { lines: number[] }) => item.lines.map(id => id.toString())

        const results = fuseResults(retrievers, rankingIdentities)

        expect(results).toEqual(
            new Set([
                { name: 'set1doc1', lines: [1, 2, 3, 4] },
                { name: 'set2doc1', lines: [1, 2] },
                { name: 'set1doc2', lines: [7, 8] },
                { name: 'set2doc2', lines: [5, 6] },
            ])
        )
    })

    it('retains the right order of duplicated documents', () => {
        const retrievers = [new Set([3]), new Set([1, 2])]
        const rankingIdentities = () => ['same']

        const results = fuseResults(retrievers, rankingIdentities)

        expect(results).toEqual(new Set([3, 1, 2]))
    })

    it('returns empty list when no results', () => {
        const results = fuseResults([], () => ({}) as any)
        expect(results).toEqual(new Set([]))
    })
})
