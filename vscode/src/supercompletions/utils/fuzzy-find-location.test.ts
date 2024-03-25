import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { document } from '../../completions/test-helpers'
import { fuzzyFindLocation } from './fuzzy-find-location'

describe('fuzzyFindLocation', () => {
    it('should find the right spot', () => {
        const doc = document(dedent`
            function foo() {
                return 1
            }

            function bar() {
                return 2
            }
        `)
        const needle = dedent`
            function bar() {
                return 2
            }
        `

        const { distance, range } = fuzzyFindLocation(doc, needle)!

        expect(distance).toBe(0)
        expect(doc.getText(range)).toBe(needle)
    })

    it('should fix indentation', () => {
        const doc = document(dedent`
            function foo() {
                return 1
            }

                function bar() {
                    return 2
                }
        `)
        const needle = dedent`
            function bar() {
                return 2
            }
        `

        const { distance, range } = fuzzyFindLocation(doc, needle)!

        expect(distance).toBe(4)
        expect(doc.getText(range)).toBe(needle)
    })
})
