import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { document } from '../../completions/test-helpers'
import { vsCodeMocks } from '../../testutils/mocks'
import { range } from '../../testutils/textDocument'

import { findRangeByLine, getDocumentSections } from './document-sections'

describe('getDocumentSections', () => {
    it('filters out top level classes for languages with closing braces and symbols', async () => {
        const doc = document(dedent`
            class Foo {
                bar() {
                    function baz() {
                        // Oh no
                    }
                    return 1
                }
            }
        `)

        // Note: folding ranges do not span over the closing brace
        const foldingRanges = [
            { start: 0, end: 6 },
            { start: 1, end: 5 },
            { start: 2, end: 3 },
        ]

        const symbols = [
            {
                kind: vsCodeMocks.SymbolKind.Class,
                location: {
                    range: range(0, 0, 7, 1),
                },
            },
        ]

        expect(
            await getDocumentSections(
                doc,
                () => Promise.resolve(foldingRanges as any),
                () => Promise.resolve(symbols as any)
            )
        ).toMatchInlineSnapshot(`
              [
                Range {
                  "end": Position {
                    "character": 5,
                    "line": 6,
                  },
                  "start": Position {
                    "character": 0,
                    "line": 1,
                  },
                },
              ]
            `)
    })

    it('filters out top level classes for languages without closing braces and symbols', async () => {
        const doc = document(dedent`
            class Foo {
                bar() {
                    function baz() {
                        // Oh no
                    }
                    return 1
                }
            }
        `)

        // Note: folding ranges do not span over the closing brace
        const foldingRanges = [
            { start: 0, end: 6 },
            { start: 1, end: 5 },
            { start: 2, end: 3 },
        ]

        const symbols = [
            {
                kind: vsCodeMocks.SymbolKind.Class,
                location: {
                    range: range(0, 0, 7, 1),
                },
            },
        ]

        expect(
            await getDocumentSections(
                doc,
                () => Promise.resolve(foldingRanges as any),
                () => Promise.resolve(symbols as any)
            )
        ).toMatchInlineSnapshot(`
          [
            Range {
              "end": Position {
                "character": 5,
                "line": 6,
              },
              "start": Position {
                "character": 0,
                "line": 1,
              },
            },
          ]
        `)
    })

    it('filters out large folding ranges from the top level', async () => {
        const doc = document(dedent`
            describe('foo', () => {
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                // long
                it('is awesome', () => {
                    // Oh so awesome!
                })
            })
        `)

        // Note: folding ranges do not span over the closing brace
        const foldingRanges = [
            { start: 0, end: 104 },
            { start: 102, end: 103 },
        ]

        expect(
            await getDocumentSections(
                doc,
                () => Promise.resolve(foldingRanges as any),
                () => Promise.resolve([])
            )
        ).toMatchInlineSnapshot(`
              [
                Range {
                  "end": Position {
                    "character": 6,
                    "line": 104,
                  },
                  "start": Position {
                    "character": 0,
                    "line": 102,
                  },
                },
              ]
            `)
    })

    it('filters out what appears like classes for languages with no symbol support', async () => {
        const doc = document(
            dedent`
                class Foo {
                    bar() {
                        function baz() {
                            // Oh no
                        }
                        return 1
                    }
                }
            `,
            'plaintext'
        )

        // Note: folding ranges do not span over the closing brace
        const foldingRanges = [
            { start: 0, end: 6 },
            { start: 1, end: 5 },
            { start: 2, end: 3 },
        ]

        expect(
            await getDocumentSections(
                doc,
                () => Promise.resolve(foldingRanges as any),
                () => Promise.resolve([])
            )
        ).toMatchInlineSnapshot(`
              [
                Range {
                  "end": Position {
                    "character": 5,
                    "line": 6,
                  },
                  "start": Position {
                    "character": 0,
                    "line": 1,
                  },
                },
              ]
            `)
    })
})

describe('findRangeByLine', () => {
    it('returns range containing target', () => {
        const first = range(0, 0, 10, 10)
        const second = range(20, 0, 30, 10)
        const ranges = [first, second]
        const target = 5

        const result = findRangeByLine(ranges, target)

        expect(result).toBe(first)
    })

    it('returns undefined if no range contains target', () => {
        const first = range(0, 0, 10, 10)
        const second = range(20, 0, 30, 10)
        const ranges = [first, second]
        const target = 15

        const result = findRangeByLine(ranges, target)

        expect(result).toBe(undefined)
    })
})
