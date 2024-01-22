import { describe, expect, it } from 'vitest'

import { fuseContext } from './fuse-context'

describe('fuseContext', () => {
    it('fuses multiple context item lists into one ranked list', () => {
        const retrievers = [
            [1, 2],
            [2, 3],
        ]
        const rankingIdentity = (item: number) => item.toString()

        const results = fuseContext(retrievers, rankingIdentity)

        expect(results).toEqual([2, 2, 1, 3])
    })

    it('handles one retriever returning the same document multiple times', () => {
        const retrievers = [
            [1, 2, 2],
            [2, 3],
        ]
        const rankingIdentity = (item: number) => item.toString()

        const results = fuseContext(retrievers, rankingIdentity)

        expect(results).toEqual([2, 2, 2, 1, 3])
    })

    it('retains the right order of duplicated documents', () => {
        const retrievers = [[3], [1, 2]]
        const rankingIdentity = () => 'same'

        const results = fuseContext(retrievers, rankingIdentity)

        expect(results).toEqual([3, 1, 2])
    })

    it('returns empty list when no results', () => {
        const results = fuseContext([], () => ({}) as any)
        expect(results).toEqual([])
    })
})
