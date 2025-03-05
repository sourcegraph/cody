import { describe, expect, it } from 'vitest'
import { makeVisualDiff } from '.'
import { document } from '../../../../completions/test-helpers'
import { getDecorationInfo } from '../../diff-utils'
import { blockify } from './blockify'

function blockifyAndExtractForTest(originalText: string, modifiedText: string): { code: string } {
    const mockDocument = document(originalText)
    const decorationInfo = getDecorationInfo(originalText, modifiedText)
    const { diff } = makeVisualDiff(decorationInfo, 'additions', mockDocument)
    const blockified = blockify(diff, mockDocument)
    return { code: blockified.lines.map(({ text }) => text).join('\n') }
}

const UNICODE_SPACE = '\u00A0'
const FOUR_SPACE_INDENTATION = UNICODE_SPACE.repeat(4)

describe('blockify', () => {
    describe('space indentation', () => {
        it('removes leading space-indended blocks', () => {
            const originalText = `${FOUR_SPACE_INDENTATION}hello world\n${FOUR_SPACE_INDENTATION}goodbye world`
            const modifiedText = `${FOUR_SPACE_INDENTATION}hallo world\n${FOUR_SPACE_INDENTATION}gaadbye world`
            const { code } = blockifyAndExtractForTest(originalText, modifiedText)
            expect(code).toMatchInlineSnapshot(`
              "hallo world  
              gaadbye world"
            `)
        })

        it('removes leading space-indended blocks whilst maintaining indentation levels', () => {
            const originalText = `${FOUR_SPACE_INDENTATION}hello world\n${FOUR_SPACE_INDENTATION}goodbye world`
            const modifiedText = `${FOUR_SPACE_INDENTATION}hallo world\n${FOUR_SPACE_INDENTATION}${FOUR_SPACE_INDENTATION}gaadbye world`
            const { code } = blockifyAndExtractForTest(originalText, modifiedText)
            expect(code).toMatchInlineSnapshot(`
              "hallo world      
                  gaadbye world"
            `)
        })
    })

    describe('tab indentation', () => {
        it('removes leading tab-indented blocks', () => {
            const originalText = '\thello world\n\tgoodbye world'
            const modifiedText = '\thallo world\n\tgaadbye world'
            const { code } = blockifyAndExtractForTest(originalText, modifiedText)
            expect(code).toMatchInlineSnapshot(`
              "hallo world  
              gaadbye world"
            `)
        })

        it('removes leading tab-indented blocks whilst maintaining indentation levels', () => {
            const originalText = '\thello world\n\tgoodbye world'
            const modifiedText = '\thallo world\n\t\tgaadbye world'
            const { code } = blockifyAndExtractForTest(originalText, modifiedText)
            expect(code).toMatchInlineSnapshot(`
              "hallo world      
                  gaadbye world"
            `)
        })
    })
})
