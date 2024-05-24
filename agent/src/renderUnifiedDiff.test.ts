import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { renderUnifiedDiff } from './renderUnifiedDiff'

describe('renderUnifiedDiff', () => {
    function diff(a: string, b: string): string {
        return renderUnifiedDiff({ header: 'a', text: a }, { header: 'b', text: b })
    }
    it('basic', () => {
        expect(
            diff(
                dedent`
        Line 1
        Line 2
        Line 3
        Line 4
        `,
                dedent`
        Line 0
        Line 2
        Line 3`
            )
        ).toMatchInlineSnapshot(`
          "--- a
          +++ b
          - Line 1
          + Line 0
            Line 2
            Line 3
          - Line 4"
        `)
    })
    it('long equal lines', () => {
        expect(
            diff(
                dedent`
                a
                b
                c
                d
                e
                f
                g
                h
                i
        `,
                dedent`
                a
                b
                c
                d
                e2
                f
                g
                h
                i
        `
            )
        ).toMatchInlineSnapshot(`
          "--- a
          +++ b
            a
            b
            c
            d
          - e
          + e2
            f
            g
            h
            i"
        `)
    })

    it('trailing whitespace', () => {
        expect(
            diff(['a ', 'b  ', 'c   '].join('\n'), ['a ', 'b ', 'c '].join('\n'))
        ).toMatchInlineSnapshot(`
          "--- a
          +++ b
            a␣
          - b␣␣
          - c␣␣␣
          + b␣
          + c␣"
        `)
    })
})
