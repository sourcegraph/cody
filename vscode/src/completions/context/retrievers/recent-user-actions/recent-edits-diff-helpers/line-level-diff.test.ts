import dedent from 'dedent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { getTextDocumentChangesForText } from './helper'
import { LineLevelDiffStrategy, type LineLevelStrategyOptions } from './line-level-diff'

const processComputedDiff = (text: string): string => {
    const lines = text.split('\n')
    const updatedText = lines.filter(line => !line.includes('\\ No newline at end of file')).join('\n')
    return updatedText
}

describe('LineLevelDiffStrategy', () => {
    const getTextDocumentChanges = (text: string) => {
        const { originalText, changes } = getTextDocumentChangesForText(text)
        // Advance the time to simulate Date.now() at a later time compared to when the changes were made
        vi.advanceTimersByTime(1)
        return {
            originalText,
            changes,
        }
    }

    const getStrategyOptions = (shouldGroupNonOverlappingLines: boolean): LineLevelStrategyOptions => ({
        contextLines: 3,
        longTermDiffCombinationStrategy: shouldGroupNonOverlappingLines ? 'lines-based' : undefined,
        minShortTermEvents: 1,
        minShortTermTimeMs: 0,
    })

    beforeEach(() => {
        vi.useFakeTimers()
    })

    describe('with non-overlapping lines grouping enabled', () => {
        const strategy = new LineLevelDiffStrategy(getStrategyOptions(true))

        it('handles multiple line changes with grouping', () => {
            const text = dedent`
                <DC>let</DC><IC>const</IC> x = 5;
                console.log('break');
                <DC>let</DC><IC>const</IC> y = 10;
            `
            const { originalText, changes } = getTextDocumentChanges(text)
            const diffs = strategy.getDiffHunks({
                uri: vscode.Uri.parse('file://test.ts'),
                oldContent: originalText,
                changes,
            })
            expect(diffs.length).toBe(2)
            expect(processComputedDiff(diffs[1].diff.toString())).toMatchInlineSnapshot(`
                "1-| let x = 5;
                1+| const x = 5;
                2 | console.log('break');
                3 | let y = 10;"
            `)
            expect(processComputedDiff(diffs[0].diff.toString())).toMatchInlineSnapshot(`
                "1 | const x = 5;
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
            const { originalText, changes } = getTextDocumentChanges(text)
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
        const strategy = new LineLevelDiffStrategy(getStrategyOptions(false))

        it('handles multiple separate changes without grouping', () => {
            const text = dedent`
                <DC>let</DC><IC>const</IC> x = 5;
                console.log('break');
                <DC>let</DC><IC>const</IC> y = 10;
            `
            const { originalText, changes } = getTextDocumentChanges(text)
            const diffs = strategy.getDiffHunks({
                uri: vscode.Uri.parse('file://test.ts'),
                oldContent: originalText,
                changes,
            })
            expect(diffs.length).toBe(2)
            expect(processComputedDiff(diffs[1].diff.toString())).toMatchInlineSnapshot(`
              "1-| let x = 5;
              1+| const x = 5;
              2 | console.log('break');
              3 | let y = 10;"
            `)
            expect(processComputedDiff(diffs[0].diff.toString())).toMatchInlineSnapshot(`
              "1 | const x = 5;
              2 | console.log('break');
              3-| let y = 10;
              3+| const y = 10;"
            `)
        })
    })
})
