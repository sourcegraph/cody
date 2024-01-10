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

const matchSnippet = `
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
        const matchText = [
            'foo',
            'bar',
            'baz',
            'qux',
            'quux',
            'quuz',
            'corge',
            'grault',
            'garply',
            'waldo',
            'fred',
            'plugh',
            'xyzzy',
            'thud',
        ].join('\n')
        expect(bestJaccardMatches('foo\nbar\nbaz', matchText, 3, MAX_MATCHES)[0]).toEqual({
            score: 1,
            content: 'foo\nbar\nbaz',
            endLine: 3,
            startLine: 0,
        })
        expect(bestJaccardMatches('bar\nquux', matchText, 4, MAX_MATCHES)[0]).toEqual({
            score: 0.5,
            content: 'bar\nbaz\nqux\nquux',
            endLine: 5,
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
            endLine: 10,
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

        // Since we slide over the target text line-by-line, we expect matchText.lines - 2 windows
        // to be returned
        expect(matches).toHaveLength(matchText.split('\n').length - 2)
        expect(matches.map(match => match.content.split('\n'))).toEqual([
            ['foo', 'bar', 'baz'],
            ['bar', 'baz', 'qux'],
            ['baz', 'qux', 'foo'],
            ['qux', 'foo', 'quuz'],
            ['foo', 'quuz', 'corge'],
            ['quuz', 'corge', 'grault'],
            ['corge', 'grault', 'garply'],
            ['grault', 'garply', 'waldo'],
            ['garply', 'waldo', 'fred'],
            ['waldo', 'fred', 'plugh'],
            ['fred', 'plugh', 'xyzzy'],
            ['plugh', 'xyzzy', 'thud'],
        ])
    })

    it('works with code snippets', () => {
        expect(bestJaccardMatches(targetSnippet, matchSnippet, 5, MAX_MATCHES)[0]).toMatchInlineSnapshot(`
          {
            "content": "describe('bestJaccardMatch', () => {
              it('should return the best match', () => {
                  const matchText = [
                      'foo',
                      'bar',",
            "endLine": 6,
            "score": 0.08695652173913043,
            "startLine": 1,
          }
        `)
    })
})
