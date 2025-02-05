import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { document } from '../../../completions/test-helpers'
import { blockify } from './blockify'
import type { AddedLinesDecorationInfo } from './default-decorator'

function blockifyAndExtractForTest(
    document: vscode.TextDocument,
    textToHighlight: {
        range: vscode.Range
        // Used to verify that our test is setup correctly.
        // i.e. we expect to highlight "hello" and the range we did highlight matches that
        expectedText: string
    }[]
): { code: string; ranges: number[][] } {
    const addedLines: AddedLinesDecorationInfo[] = []
    for (const { expectedText, range } of textToHighlight) {
        const highlightedText = document.getText(range)

        // Assert that the test is setup correctly, to avoid incorrectly providing the wrong range
        expect(highlightedText).toBe(expectedText)

        addedLines.push({
            highlightedRanges: [
                { type: 'diff-added', range: [range.start.character, range.end.character] },
            ],
            afterLine: range.start.line,
            lineText: document.lineAt(range.start.line).text,
        })
    }

    const blockified = blockify(document, addedLines)
    return {
        code: blockified.map(({ lineText }) => lineText).join('\n'),
        ranges: blockified.flatMap(({ highlightedRanges }) =>
            highlightedRanges.map(({ range }) => range)
        ),
    }
}

const UNICODE_SPACE = '\u00A0'
const FOUR_SPACE_INDENTATION = UNICODE_SPACE.repeat(4)

describe('blockify', () => {
    describe('space indentation', () => {
        it('removes leading space-indended blocks', () => {
            const mockSpacesDocument = document(
                `${FOUR_SPACE_INDENTATION}hello world\n${FOUR_SPACE_INDENTATION}goodbye world`
            )
            const { code, ranges } = blockifyAndExtractForTest(mockSpacesDocument, [
                {
                    range: new vscode.Range(0, 4, 0, 9),
                    expectedText: 'hello',
                },
                {
                    range: new vscode.Range(1, 4, 1, 11),
                    expectedText: 'goodbye',
                },
            ])

            expect(code).toMatchInlineSnapshot(`
              "hello world  
              goodbye world"
            `)
            expect(ranges).toStrictEqual([
                // Indentation removed, range length maintained
                [0, 5],
                // Indentation removed, range length maintained
                [0, 7],
            ])
        })

        it('removes leading space-indended blocks whilst maintaining indentation levels', () => {
            const mockSpacesDocument = document(
                `${FOUR_SPACE_INDENTATION}hello world\n${FOUR_SPACE_INDENTATION}${FOUR_SPACE_INDENTATION}goodbye world`
            )

            const { code, ranges } = blockifyAndExtractForTest(mockSpacesDocument, [
                {
                    range: new vscode.Range(0, 4, 0, 9),
                    expectedText: 'hello',
                },
                {
                    range: new vscode.Range(1, 8, 1, 15),
                    expectedText: 'goodbye',
                },
            ])

            expect(code).toMatchInlineSnapshot(`
              "hello world      
                  goodbye world"
            `)
            expect(ranges).toStrictEqual([
                // Indentation removed, range length maintained
                [0, 5],
                // Indentation reduced by one level, range length maintained
                [4, 11],
            ])
        })
    })

    describe('tab indentation', () => {
        it('removes leading tab-indented blocks', () => {
            const mockTabsDocument = document('\thello world\n\tgoodbye world')
            const { code, ranges } = blockifyAndExtractForTest(mockTabsDocument, [
                {
                    range: new vscode.Range(0, 1, 0, 6),
                    expectedText: 'hello',
                },
                {
                    range: new vscode.Range(1, 1, 1, 8),
                    expectedText: 'goodbye',
                },
            ])
            expect(code).toMatchInlineSnapshot(`
              "hello world  
              goodbye world"
            `)
            expect(ranges).toStrictEqual([
                // Indentation removed, range length maintained
                [0, 5],
                // Indentation removed, range length maintained
                [0, 7],
            ])
        })

        it('removes leading tab-indented blocks whilst maintaining indentation levels', () => {
            const mockTabsDocument = document('\thello world\n\t\tgoodbye world')
            const { code, ranges } = blockifyAndExtractForTest(mockTabsDocument, [
                {
                    range: new vscode.Range(0, 1, 0, 6),
                    expectedText: 'hello',
                },
                {
                    range: new vscode.Range(1, 2, 1, 9),
                    expectedText: 'goodbye',
                },
            ])

            expect(code).toMatchInlineSnapshot(`
              "hello world      
                  goodbye world"
            `)
            expect(ranges).toStrictEqual([
                // Indentation removed, range length maintained
                [0, 5],
                // Indentation converted to whitespace and reduced by one level, range length maintained
                [4, 11],
            ])
        })
    })
})
