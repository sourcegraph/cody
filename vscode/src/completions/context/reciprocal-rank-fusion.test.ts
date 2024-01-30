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

    it('handles the same result being part of multiple documents without getting duplicated', () => {
        const retrievers = [
            new Set([{ lines: [1, 2, 3, 4] }, { lines: [7, 8] }]),
            new Set([{ lines: [1, 2] }, { lines: [5, 6] }]),
        ]
        const rankingIdentities = (item: { lines: number[] }) => item.lines.map(id => id.toString())

        const results = fuseResults(retrievers, rankingIdentities)

        expect(results).toEqual(
            new Set([{ lines: [1, 2, 3, 4] }, { lines: [1, 2] }, { lines: [7, 8] }, { lines: [5, 6] }])
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
