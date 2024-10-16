import { describe, expect, test } from 'vitest'
import { ContextItemSource } from '../codebase-context/messages'
import {
    type SerializedContextItem,
    contextItemMentionNodeDisplayText,
    getMentionOperations,
} from './nodes'

describe('contextItemMentionNodeDisplayText', () => {
    test('file', () =>
        expect(contextItemMentionNodeDisplayText({ type: 'file', uri: 'file:///foo/bar.ts' })).toBe(
            'bar.ts'
        ))

    test('file range of full end line', () =>
        expect(
            contextItemMentionNodeDisplayText({
                type: 'file',
                uri: 'file:///a.go',
                range: { start: { line: 1, character: 0 }, end: { line: 4, character: 0 } },
            })
        ).toBe('a.go:2-4'))

    test('file range', () =>
        expect(
            contextItemMentionNodeDisplayText({
                type: 'file',
                uri: 'file:///a.go',
                range: { start: { line: 1, character: 2 }, end: { line: 4, character: 4 } },
            })
        ).toBe('a.go:2-5'))

    test('symbol', () =>
        expect(
            contextItemMentionNodeDisplayText({
                type: 'symbol',
                uri: 'file:///foo/bar.ts',
                range: { start: { line: 1, character: 2 }, end: { line: 3, character: 4 } },
                symbolName: 'MySymbol',
                kind: 'function',
            })
        ).toBe('MySymbol'))
})

describe('getMentionOperations', () => {
    test('processes references for multiple URIs', () => {
        const existing: SerializedContextItem[] = [
            {
                uri: 'file1.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
            {
                uri: 'file2.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
        ]
        const toAdd: SerializedContextItem[] = [
            {
                uri: 'file2.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
            {
                uri: 'file3.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
        ]

        const result = getMentionOperations(existing, toAdd)

        expect(result.create).toEqual([toAdd[1]])
        expect(result.modify).toEqual(new Map())
        expect(result.delete).toEqual(new Set())
    })

    test('handles empty existing and non-empty toAdd arrays', () => {
        const existing: SerializedContextItem[] = []
        const toAdd: SerializedContextItem[] = [
            {
                uri: 'file1.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
            {
                uri: 'file2.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
        ]

        const result = getMentionOperations(existing, toAdd)

        expect(result).toEqual({
            create: toAdd,
            modify: new Map(),
            delete: new Set(),
        })
    })

    test('handles non-empty existing and empty toAdd arrays', () => {
        const existing: SerializedContextItem[] = [
            {
                uri: 'file1.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
            {
                uri: 'file2.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
        ]
        const toAdd: SerializedContextItem[] = []

        const result = getMentionOperations(existing, toAdd)

        expect(result).toEqual({
            create: [],
            modify: new Map(),
            delete: new Set(),
        })
    })

    test('handles duplicate URIs in toAdd array', () => {
        const existing: SerializedContextItem[] = [
            {
                uri: 'file1.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
        ]
        const toAdd: SerializedContextItem[] = [
            {
                uri: 'file1.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
            {
                uri: 'file1.ts',
                type: 'file',
                source: ContextItemSource.User,
            },
        ]

        const result = getMentionOperations(existing, toAdd)

        expect(result).toEqual({
            create: [],
            modify: new Map(),
            delete: new Set(),
        })
    })

    test('adding the same item twice is a no-op', () => {
        const existing: SerializedContextItem = {
            uri: 'file1.ts',
            type: 'file',
            source: ContextItemSource.User,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 10, character: 0 },
            },
        }

        const result = getMentionOperations([existing], [existing])
        expect(result).toEqual({
            create: [],
            modify: new Map(),
            delete: new Set(),
        })
    })

    test('adding a new item which subsumes the existing items should yield a delete and an add', () => {
        const existing: SerializedContextItem = {
            uri: 'file1.ts',
            type: 'file',
            source: ContextItemSource.User,
            range: {
                start: { line: 6, character: 0 },
                end: { line: 10, character: 0 },
            },
        }

        const update: SerializedContextItem = {
            uri: 'file1.ts',
            type: 'file',
            source: ContextItemSource.User,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 15, character: 0 },
            },
        }

        const result = getMentionOperations([existing], [update])

        expect(result.delete).toContain(existing)
        expect(result.create).toEqual([update])
    })

    test('adding a submention of an existing item is a no-op', () => {
        const existing: SerializedContextItem = {
            uri: 'file1.ts',
            type: 'file',
            source: ContextItemSource.User,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 10, character: 0 },
            },
        }

        const update: SerializedContextItem = {
            uri: 'file1.ts',
            type: 'file',
            source: ContextItemSource.User,
            range: {
                start: { line: 0, character: 0 },
                end: { line: 5, character: 0 },
            },
        }

        const result = getMentionOperations([existing], [update])
        expect(result).toEqual({
            create: [],
            modify: new Map(),
            delete: new Set(),
        })
    })

    test('merges items with partial overlaps', () => {
        const a: SerializedContextItem = {
            type: 'file',
            uri: 'file:///a.ts',
            source: ContextItemSource.User,
            range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
            size: 10,
        }

        const b: SerializedContextItem = {
            type: 'file',
            uri: 'file:///b.ts',
            source: ContextItemSource.User,
            range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
            size: 15,
        }

        const updates: SerializedContextItem[] = [
            {
                type: 'file',
                uri: 'file:///a.ts',
                source: ContextItemSource.User,
                range: { start: { line: 5, character: 0 }, end: { line: 15, character: 0 } },
                size: 11,
            },
            {
                type: 'file',
                uri: 'file:///b.ts',
                source: ContextItemSource.User,
                range: { start: { line: 3, character: 0 }, end: { line: 8, character: 0 } },
                size: 5,
            },
        ]
        const result = getMentionOperations([a, b], updates)
        expect(result).toEqual({
            modify: new Map([
                [
                    a,
                    {
                        type: 'file',
                        uri: 'file:///a.ts',
                        source: ContextItemSource.User,
                        range: { start: { line: 0, character: 0 }, end: { line: 15, character: 0 } },
                        size: 21,
                    },
                ],
                [
                    b,
                    {
                        type: 'file',
                        uri: 'file:///b.ts',
                        source: ContextItemSource.User,
                        range: { start: { line: 0, character: 0 }, end: { line: 8, character: 0 } },
                        size: 20,
                    },
                ],
            ]),
            create: [],
            delete: new Set(),
        })
    })

    test('merges overlapping items', () => {
        const existing: SerializedContextItem = {
            type: 'file',
            uri: 'file:///a.ts',
            source: ContextItemSource.User,
            range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
        }

        const update: SerializedContextItem = {
            type: 'file',
            uri: 'file:///a.ts',
            source: ContextItemSource.User,
            range: { start: { line: 5, character: 0 }, end: { line: 15, character: 0 } },
        }

        const result = getMentionOperations([existing], [update])
        expect(result.modify.get(existing)).toEqual({
            type: 'file',
            uri: 'file:///a.ts',
            source: ContextItemSource.User,
            range: { start: { line: 0, character: 0 }, end: { line: 15, character: 0 } },
        })
        expect(result.modify).toHaveLength(1)
        expect(result.create).toHaveLength(0)
        expect(result.delete).toHaveLength(0)
    })

    test('merge items with same lines but character based overlaps', () => {
        const a: SerializedContextItem = {
            type: 'file',
            uri: 'file:///a.ts',
            source: ContextItemSource.User,
            range: { start: { line: 1, character: 2 }, end: { line: 10, character: 15 } },
            size: 11,
        }
        const b: SerializedContextItem = {
            type: 'file',
            uri: 'file:///b.ts',
            source: ContextItemSource.User,
            range: { start: { line: 1, character: 7 }, end: { line: 8, character: 9 } },
            size: 15,
        }

        const c: SerializedContextItem = {
            type: 'file',
            uri: 'file:///c.ts',
            source: ContextItemSource.User,
            range: { start: { line: 1, character: 10 }, end: { line: 10, character: 15 } },
            size: 11,
        }

        const updates: SerializedContextItem[] = [
            {
                type: 'file',
                uri: 'file:///a.ts',
                source: ContextItemSource.User,
                // Completely contained within existing
                range: { start: { line: 1, character: 29 }, end: { line: 10, character: 4 } },
                size: 10,
            },
            {
                type: 'file',
                uri: 'file:///b.ts',
                source: ContextItemSource.User,
                // overlaps existing, should be merged
                range: { start: { line: 3, character: 0 }, end: { line: 8, character: 26 } },
                size: 11,
            },
            {
                type: 'file',
                uri: 'file:///c.ts',
                source: ContextItemSource.User,
                // completely distinct, should be added
                range: { start: { line: 10, character: 16 }, end: { line: 30, character: 1 } },
                size: 13,
            },
        ]

        const result = getMentionOperations([a, b, c], updates)
        expect(result.modify.get(b)).toEqual({
            type: 'file',
            uri: 'file:///b.ts',
            source: ContextItemSource.User,
            range: { start: { line: 1, character: 7 }, end: { line: 8, character: 26 } },
            size: 26,
        })
        expect(result.modify).toHaveLength(1)
        expect(result.delete).toHaveLength(0)
        expect(result.create).toEqual([
            {
                type: 'file',
                uri: 'file:///c.ts',
                source: ContextItemSource.User,
                // completely distinct, should be added
                range: { start: { line: 10, character: 16 }, end: { line: 30, character: 1 } },
                size: 13,
            },
        ])
    })

    test('merges items with implicit overlap', () => {
        const a: SerializedContextItem = {
            type: 'file',
            uri: 'file:///a.ts',
            source: ContextItemSource.User,
            range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
            size: 12,
        }

        const b: SerializedContextItem = {
            type: 'file',
            uri: 'file:///b.ts',
            source: ContextItemSource.User,
        }

        const c: SerializedContextItem = {
            type: 'file',
            uri: 'file:///c.ts',
            source: ContextItemSource.Search,
            range: { start: { line: 5, character: 0 }, end: { line: 15, character: 0 } },
        }

        const toAdd: SerializedContextItem[] = [
            {
                type: 'file',
                uri: 'file:///a.ts',
                source: ContextItemSource.User,
                // Expanded range so should be merged
                range: { start: { line: 5, character: 0 }, end: { line: 15, character: 0 } },
                size: 10,
            },
            {
                type: 'file',
                uri: 'file:///c.ts',
                // Same range but different source so should be added
                source: ContextItemSource.User,
                range: { start: { line: 0, character: 0 }, end: { line: 15, character: 0 } },
            },
            {
                type: 'file',
                uri: 'file:///c.ts',
                // Same source and range so should be ignored
                source: ContextItemSource.Search,
                range: { start: { line: 5, character: 0 }, end: { line: 15, character: 0 } },
            },
            {
                type: 'file',
                uri: 'file:///d.ts',
                source: ContextItemSource.Editor,
            },
        ]

        const result = getMentionOperations([a, b, c], toAdd)
        expect(result.modify.get(a)).toEqual({
            type: 'file',
            uri: 'file:///a.ts',
            source: ContextItemSource.User,
            range: { start: { line: 0, character: 0 }, end: { line: 15, character: 0 } },
            size: 22,
        })
        expect(result.modify).toHaveLength(1)
        expect(result.create).toEqual([
            {
                type: 'file',
                uri: 'file:///c.ts',
                source: ContextItemSource.User,
                range: { start: { line: 0, character: 0 }, end: { line: 15, character: 0 } },
            },
            {
                type: 'file',
                uri: 'file:///d.ts',
                source: ContextItemSource.Editor,
            },
        ])
    })

    test('does not merge items with different sources', () => {
        const existing: SerializedContextItem = {
            type: 'file',
            uri: 'file:///a.ts',
            source: ContextItemSource.Editor,
        }

        const update: SerializedContextItem = {
            type: 'file',
            uri: 'file:///a.ts',
            source: ContextItemSource.User,
        }

        const result = getMentionOperations([existing], [update])
        expect(result.create).toEqual([update])
        expect(result.modify).toHaveLength(0)
        expect(result.delete).toHaveLength(0)
    })
})
