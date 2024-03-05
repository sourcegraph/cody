import { type ContextItem, testFileUri } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { fuseContext } from './context'

describe('fuseContext', () => {
    const uri = testFileUri('test.ts')
    const keywordItems: ContextItem[] = [
        { type: 'file', content: '0', uri, source: 'keyword' },
        { type: 'file', content: '1', uri, source: 'keyword' },
        { type: 'file', content: '2', uri, source: 'keyword' },
        { type: 'file', content: '3', uri, source: 'keyword' },
        { type: 'file', content: '4', uri, source: 'keyword' },
        { type: 'file', content: '5', uri, source: 'keyword' },
        { type: 'file', content: '6', uri, source: 'keyword' },
        { type: 'file', content: '7', uri, source: 'keyword' },
        { type: 'file', content: '8', uri, source: 'keyword' },
        { type: 'file', content: '9', uri, source: 'keyword' },
    ]
    const embeddingsItems: ContextItem[] = [
        { type: 'file', content: 'A', uri, source: 'embeddings' },
        { type: 'file', content: 'B', uri, source: 'embeddings' },
        { type: 'file', content: 'C', uri, source: 'embeddings' },
    ]

    function joined(items: ContextItem[]): string {
        return items.map(r => r.content).join('')
    }

    it('includes the right 80-20 split', () => {
        const maxChars = 10
        const result = fuseContext(keywordItems, embeddingsItems, maxChars)
        expect(joined(result)).toEqual('01234567AB')
    })

    it('skips over large items in an attempt to optimize utilization', () => {
        const keywordItems: ContextItem[] = [
            { type: 'file', content: '0', uri, source: 'keyword' },
            { type: 'file', content: '1', uri, source: 'keyword' },
            { type: 'file', content: '2', uri, source: 'keyword' },
            { type: 'file', content: '3', uri, source: 'keyword' },
            { type: 'file', content: '4', uri, source: 'keyword' },
            { type: 'file', content: '5', uri, source: 'keyword' },
            { type: 'file', content: 'very large keyword item', uri, source: 'keyword' },
            { type: 'file', content: '6', uri, source: 'keyword' },
            { type: 'file', content: '7', uri, source: 'keyword' },
            { type: 'file', content: '8', uri, source: 'keyword' },
            { type: 'file', content: '9', uri, source: 'keyword' },
        ]
        const embeddingsItems: ContextItem[] = [
            { type: 'file', content: 'A', uri, source: 'embeddings' },
            { type: 'file', content: 'very large embeddings item', uri, source: 'embeddings' },
            { type: 'file', content: 'B', uri, source: 'embeddings' },
            { type: 'file', content: 'C', uri, source: 'embeddings' },
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
