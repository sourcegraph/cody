import dedent from 'dedent'
import { describe, expect, test } from 'vitest'
import { computeLineDiff } from './line-diff'

describe('Line Diff', () => {
    test('computes the diff correctly', async () => {
        const text = dedent`
            function log(message: string): void {
                console.log(message);
            }
        `
        const replacement = dedent`
            /**
        `
        const diff = computeLineDiff(text, replacement)
        expect(diff).toMatchInlineSnapshot(`
          [
            {
              "added": undefined,
              "count": 1,
              "removed": true,
              "value": "function log(message: string): void {",
            },
            {
              "added": true,
              "count": 1,
              "removed": undefined,
              "value": "/**",
            },
          ]
        `)
    })
})
