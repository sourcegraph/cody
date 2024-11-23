import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { getTextDocumentChangesForText } from './helper'
import { LineLevelDiffStrategy } from './line-level-diff'

const processComputedDiff = (text: string): string => {
    const lines = text.split('\n')
    const updatedText = lines.filter(line => !line.includes('\\ No newline at end of file')).join('\n')
    return updatedText
}

describe('LineLevelDiffStrategy', () => {
    describe('with non-overlapping lines grouping enabled', () => {
        const strategy = new LineLevelDiffStrategy({ shouldGroupNonOverlappingLines: true })

        it('handles multiple line changes with grouping', () => {
            const text = dedent`
                <DC>let</DC><IC>const</IC> x = 5;
                console.log('break');
                <DC>let</DC><IC>const</IC> y = 10;
            `
            const { originalText, changes } = getTextDocumentChangesForText(text)
            const diffs = strategy.getDiffHunks({
                uri: vscode.Uri.parse('file://test.ts'),
                oldContent: originalText,
                changes,
            })
            expect(diffs.length).toBe(1)
            expect(processComputedDiff(diffs[0].diff.toString())).toMatchInlineSnapshot(`
              "1-| let x = 5;
              1+| const x = 5;
              2 | console.log('break');
              3-| let y = 10;
              3+| const y = 10;"
            `)
        })

        it('handles single line change', () => {
            const text = dedent`
                const x = 5;
                <DC>var</DC><IC>let</IC> y = 10;
                console.log('test');
            `
            const { originalText, changes } = getTextDocumentChangesForText(text)
            const diffs = strategy.getDiffHunks({
                uri: vscode.Uri.parse('file://test.ts'),
                oldContent: originalText,
                changes,
            })
            expect(diffs.length).toBe(1)
            expect(processComputedDiff(diffs[0].diff.toString())).toMatchInlineSnapshot(`
              "1 | const x = 5;
              2-| var y = 10;
              2+| let y = 10;
              3 | console.log('test');"
            `)
        })
    })

    describe('with non-overlapping lines grouping disabled', () => {
        const strategy = new LineLevelDiffStrategy({ shouldGroupNonOverlappingLines: false })

        it('handles multiple separate changes without grouping', () => {
            const text = dedent`
                <DC>let</DC><IC>const</IC> x = 5;
                console.log('break');
                <DC>let</DC><IC>const</IC> y = 10;
            `
            const { originalText, changes } = getTextDocumentChangesForText(text)
            const diffs = strategy.getDiffHunks({
                uri: vscode.Uri.parse('file://test.ts'),
                oldContent: originalText,
                changes,
            })
            expect(diffs.length).toBe(2)
            expect(processComputedDiff(diffs[0].diff.toString())).toMatchInlineSnapshot(`
              "1-| let x = 5;
              1+| const x = 5;
              2 | console.log('break');
              3 | let y = 10;"
            `)
            expect(processComputedDiff(diffs[1].diff.toString())).toMatchInlineSnapshot(`
              "1 | const x = 5;
              2 | console.log('break');
              3-| let y = 10;
              3+| const y = 10;"
            `)
        })
    })

    it('returns correct strategy name', () => {
        const strategyWithGrouping = new LineLevelDiffStrategy({ shouldGroupNonOverlappingLines: true })
        expect(strategyWithGrouping.getDiffStrategyName()).toBe('line-level-diff-non-overlap-lines-true')

        const strategyWithoutGrouping = new LineLevelDiffStrategy({
            shouldGroupNonOverlappingLines: false,
        })
        expect(strategyWithoutGrouping.getDiffStrategyName()).toBe(
            'line-level-diff-non-overlap-lines-false'
        )
    })
})
