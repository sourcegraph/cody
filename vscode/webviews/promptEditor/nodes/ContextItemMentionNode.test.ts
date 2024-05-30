import { isWindows } from '@sourcegraph/cody-shared'
import { describe, expect, test } from 'vitest'
import { contextItemMentionNodeDisplayText } from './ContextItemMentionNode'

describe('contextItemMentionNodeDisplayText', () => {
    test('file', () =>
        expect(contextItemMentionNodeDisplayText({ type: 'file', uri: 'file:///foo/bar.ts' })).toBe(
            isWindows() ? 'bar.ts' : 'bar.ts'
        ))

    test('file range of full end line', () =>
        expect(
            contextItemMentionNodeDisplayText({
                type: 'file',
                uri: 'file:///a.go',
                range: { start: { line: 1, character: 0 }, end: { line: 4, character: 0 } },
            })
        ).toBe(`${isWindows() ? 'a.go' : 'a.go'}:2-4`))

    test('file range', () =>
        expect(
            contextItemMentionNodeDisplayText({
                type: 'file',
                uri: 'file:///a.go',
                range: { start: { line: 1, character: 2 }, end: { line: 4, character: 4 } },
            })
        ).toBe(`${isWindows() ? 'a.go' : 'a.go'}:2-5`))

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
