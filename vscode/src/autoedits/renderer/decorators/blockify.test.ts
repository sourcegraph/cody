import { describe, expect, it } from 'vitest'
import { document } from '../../../completions/test-helpers'
import { blockify } from './blockify'
import type { AddedLinesDecorationInfo } from './default-decorator'

describe('blockify', () => {
    describe('space indentation', () => {
        // Content doesn't matter here, just the fact that this document uses spaces
        const mockSpacesDocument = document('   hello world\n    goodbye world')

        it('removes leading space-indended blocks', () => {
            const mockAddedLines: AddedLinesDecorationInfo[] = [
                {
                    afterLine: 0,
                    lineText: '    hello world',
                    ranges: [[5, 10]]
                },
                {
                    afterLine: 1,
                    lineText: '    goodbye world',
                    ranges: [[5, 12]]
                }
            ]

            const text = blockify(mockSpacesDocument, mockAddedLines).map(({ lineText }) => lineText).join('\n')
            expect(text).toMatchInlineSnapshot(`
              "hello world  
              goodbye world"
            `)
        })

        it('removes leading space-indended blocks whilst maintaining indentation levels', () => {
            const mockAddedLines: AddedLinesDecorationInfo[] = [
                {
                    afterLine: 0,
                    lineText: '    hello world',
                    ranges: [[5, 10]]
                },
                {
                    afterLine: 1,
                    lineText: '        goodbye world',
                    ranges: [[9, 14]]
                }
            ]

            const text = blockify(mockSpacesDocument, mockAddedLines).map(({ lineText }) => lineText).join('\n')
            expect(text).toMatchInlineSnapshot(`
              "hello world      
                  goodbye world"
            `)
        })
    })

    describe('tab indentation', () => {
        // Content doesn't matter here, just the fact that this document uses tabs
        const mockSpacesDocument = document('\thello world\n\tgoodbye world')

        it('removes leading space-indended blocks', () => {
            const mockAddedLines: AddedLinesDecorationInfo[] = [
                {
                    afterLine: 0,
                    lineText: '\thello world',
                    ranges: [[5, 10]]
                },
                {
                    afterLine: 1,
                    lineText: '\tgoodbye world',
                    ranges: [[5, 12]]
                }
            ]

            const text = blockify(mockSpacesDocument, mockAddedLines).map(({ lineText }) => lineText).join('\n')
            expect(text).toMatchInlineSnapshot(`
              "hello world  
              goodbye world"
            `)
        })

        it('removes leading space-indended blocks whilst maintaining indentation levels', () => {
            const mockAddedLines: AddedLinesDecorationInfo[] = [
                {
                    afterLine: 0,
                    lineText: '\thello world',
                    ranges: [[5, 10]]
                },
                {
                    afterLine: 1,
                    lineText: '\t\tgoodbye world',
                    ranges: [[9, 14]]
                }
            ]

            const text = blockify(mockSpacesDocument, mockAddedLines).map(({ lineText }) => lineText).join('\n')
            expect(text).toMatchInlineSnapshot(`
              "hello world      
                  goodbye world"
            `)
        })
    })
})
