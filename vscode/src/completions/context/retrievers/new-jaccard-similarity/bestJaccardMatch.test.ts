import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { bestJaccardMatches, getWordOccurrences } from './bestJaccardMatch'

const targetSnippet = `
import { bestJaccardMatch, getWords } from './context'

describe('getWords', () => {
    it('works with regular text', () => {
        expect(getWords('foo bar baz')).toEqual(
            new Map<string, number>([
                ['foo', 1],
                ['bar', 1],
                ['baz', 1],
            ])
        )
        expect(getWords('running rocks slipped over')).toEqual(
            new Map<string, number>([
                ['run', 1],
                ['rock', 1],
                ['slip', 1],
            ])
        )
    })
})
`

const MAX_MATCHES = 50

describe('getWords', () => {
    it('works with regular text', () => {
        expect(getWordOccurrences('foo bar baz')).toEqual(
            new Map<string, number>([
                ['foo', 1],
                ['bar', 1],
                ['baz', 1],
            ])
        )
        expect(getWordOccurrences('running rocks slipped over')).toEqual(
            new Map<string, number>([
                ['run', 1],
                ['rock', 1],
                ['slip', 1],
            ])
        )
    })

    it('works with code snippets', () => {
        expect(getWordOccurrences(targetSnippet)).toEqual(
            new Map<string, number>([
                ['import', 1],
                ['bestjaccardmatch', 1],
                ['getword', 4],
                ['context', 1],
                ['describ', 1],
                ['work', 1],
                ['regular', 1],
                ['text', 1],
                ['expect', 2],
                ['foo', 2],
                ['bar', 2],
                ['baz', 2],
                ['toequal', 2],
                ['new', 2],
                ['map', 2],
                ['string', 2],
                ['number', 2],
                ['1', 6],
                ['run', 2],
                ['rock', 2],
                ['slip', 2],
            ])
        )
    })
})

describe('bestJaccardMatch', () => {
    it('should return the best match', () => {
        const matchText = dedent`
            foo
            bar
            baz
            qux
            quux
            quuz
            corge
            grault
            garply
            waldo
            fred
            plugh
            xyzzy
            thud
        `
        expect(bestJaccardMatches('foo\nbar\nbaz', matchText, 3, MAX_MATCHES)[0]).toEqual({
            score: 1,
            content: 'foo\nbar\nbaz',
            endLine: 2,
            startLine: 0,
        })
        expect(bestJaccardMatches('bar\nquux', matchText, 4, MAX_MATCHES)[0]).toEqual({
            score: 0.5,
            content: 'bar\nbaz\nqux\nquux',
            endLine: 4,
            startLine: 1,
        })
        expect(
            bestJaccardMatches(
                ['grault', 'notexist', 'garply', 'notexist', 'waldo', 'notexist', 'notexist'].join('\n'),
                matchText,
                6,
                MAX_MATCHES
            )[0]
        ).toEqual({
            score: 0.3,
            startLine: 4,
            endLine: 9,
            content: ['quux', 'quuz', 'corge', 'grault', 'garply', 'waldo'].join('\n'),
        })
    })

    it('returns more than one match', () => {
        const matchText = dedent`
            foo
            bar
            baz
            qux
            foo
            quuz
            corge
            grault
            garply
            waldo
            fred
            plugh
            xyzzy
            thud`

        const matches = bestJaccardMatches('foo\nbar\nbaz', matchText, 3, MAX_MATCHES)

        expect(matches).toHaveLength(4)
        expect(matches.map(match => match.content.split('\n'))).toEqual([
            ['foo', 'bar', 'baz'],
            ['qux', 'foo', 'quuz'],
            ['corge', 'grault', 'garply'],
            ['waldo', 'fred', 'plugh'],
        ])
    })

    it('works with code snippets', () => {
        expect(
            bestJaccardMatches(
                targetSnippet,
                dedent`
                    describe('bestJaccardMatch', () => {
                        it('should return the best match', () => {
                            const matchText = [
                                'foo',
                                'bar',
                                'baz',
                                'qux',
                                'quux',
                            ].join('\n')
                        })
                    })
                `,
                5,
                MAX_MATCHES
            )[0]
        ).toMatchInlineSnapshot(`
          {
            "content": "describe('bestJaccardMatch', () => {
              it('should return the best match', () => {
                  const matchText = [
                      'foo',
                      'bar',",
            "endLine": 4,
            "score": 0.08695652173913043,
            "startLine": 0,
          }
        `)
    })

    it('works for input texts that are shorter than the window size', () => {
        expect(bestJaccardMatches('foo', 'foo', 10, MAX_MATCHES)[0]).toEqual({
            content: 'foo',
            endLine: 0,
            score: 1,
            startLine: 0,
        })
    })

    it('skips over windows with empty start lines', () => {
        const matches = bestJaccardMatches(
            'foo',
            dedent`
                // foo
                // unrelated 1
                // unrelated 2


                // foo
                // unrelated 3
                // unrelated 4
            `,
            3,
            MAX_MATCHES
        )

        expect(matches[0].content).toBe('// foo\n// unrelated 1\n// unrelated 2')
        expect(matches[1].content).toBe('// foo\n// unrelated 3\n// unrelated 4')
    })

    it("does not skips over windows with empty start lines if we're at the en", () => {
        const matches = bestJaccardMatches(
            targetSnippet,
            dedent`
                // foo
                // unrelated
                // unrelated


                // foo
            `,
            3,
            MAX_MATCHES
        )

        expect(matches[0].content).toBe('\n\n// foo')
        expect(matches[1].content).toBe('// foo\n// unrelated\n// unrelated')
    })
})
