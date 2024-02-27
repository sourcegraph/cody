import { testFileUri } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import type { ContextItem } from '../../prompt-builder/types'
import { fuseContext } from './context'

describe('fuseContext', () => {
    const uri = testFileUri('test.ts')
    const keywordItems = [
        { text: '0', uri },
        { text: '1', uri },
        { text: '2', uri },
        { text: '3', uri },
        { text: '4', uri },
        { text: '5', uri },
        { text: '6', uri },
        { text: '7', uri },
        { text: '8', uri },
        { text: '9', uri },
    ]
    const embeddingsItems = [
        { text: 'A', uri },
        { text: 'B', uri },
        { text: 'C', uri },
    ]

    function joined(items: ContextItem[]): string {
        return items.map(r => r.text).join('')
    }

    it('includes the right 80-20 split', () => {
        const maxChars = 10
        const result = fuseContext(keywordItems, embeddingsItems, maxChars)
        expect(joined(result)).toEqual('01234567AB')
    })

    it('skips over large items in an attempt to optimize utilization', () => {
        const keywordItems = [
            { text: '0', uri },
            { text: '1', uri },
            { text: '2', uri },
            { text: '3', uri },
            { text: '4', uri },
            { text: '5', uri },
            { text: 'very large keyword item', uri },
            { text: '6', uri },
            { text: '7', uri },
            { text: '8', uri },
            { text: '9', uri },
        ]
        const embeddingsItems = [
            { text: 'A', uri },
            { text: 'very large embeddings item', uri },
            { text: 'B', uri },
            { text: 'C', uri },
        ]
        const maxChars = 10
        const result = fuseContext(keywordItems, embeddingsItems, maxChars)
        expect(joined(result)).toEqual('01234567AB')
    })

    it('returns an empty array when maxChars is 0', () => {
        const result = fuseContext(keywordItems, embeddingsItems, 0)
        expect(result).toEqual([])
    })

    it('includes all keyword items if there are no embeddings items', () => {
        const maxChars = 10
        const result = fuseContext(keywordItems, [], maxChars)
        expect(joined(result)).toEqual('0123456789')
    })
})
