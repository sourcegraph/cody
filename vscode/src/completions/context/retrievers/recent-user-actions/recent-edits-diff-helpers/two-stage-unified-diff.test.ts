import dedent from 'dedent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { getTextDocumentChangesForText } from './helper'
import { TwoStageUnifiedDiffStrategy } from './two-stage-unified-diff'

const processComputedDiff = (text: string): string => {
    const lines = text.split('\n')
    const updatedText = lines.filter(line => !line.includes('\\ No newline at end of file')).join('\n')
    return updatedText
}

describe('TwoStageUnifiedDiffStrategy', () => {
    const getTextDocumentChanges = (text: string) => {
        const { originalText, changes } = getTextDocumentChangesForText(text)
        const changesMaxTimestamp =
            changes.length === 0 ? Date.now() : Math.max(...changes.map(change => change.timestamp))
        vi.setSystemTime(changesMaxTimestamp + 1)

        return {
            originalText,
            changes,
        }
    }

    const strategy = new TwoStageUnifiedDiffStrategy({
        longTermContextLines: 3,
        shortTermContextLines: 0,
        minShortTermEvents: 1,
        minShortTermTimeMs: 0,
    })

    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(Date.now())
    })

    it('handles multiple changes across different lines', () => {
        const text = dedent`
            <DC>let</DC><IC>const</IC> x = 5;
            <DC>var</DC><IC>let</IC> y = 10;
            console.log('break');
            <DC>let</DC><IC>const</IC> z = 5;
            console.log(<DC>x +</DC><IC>x *</IC> y);
        `
        const { originalText, changes } = getTextDocumentChanges(text)
        const diffs = strategy.getDiffHunks({
            uri: vscode.Uri.parse('file://test.ts'),
            oldContent: originalText,
            changes,
        })
        expect(diffs.length).toBe(2)
        expect(processComputedDiff(diffs[0].diff.toString())).toMatchInlineSnapshot(`
            "5-| console.log(x + y);
            5+| console.log(x * y);"
        `)
        expect(processComputedDiff(diffs[1].diff.toString())).toMatchInlineSnapshot(`
            "1-| let x = 5;
            2-| var y = 10;
            1+| const x = 5;
            2+| let y = 10;
            3 | console.log('break');
            4-| let z = 5;
            4+| const z = 5;
            5 | console.log(x + y);"
        `)
    })

    it('handles case with no changes', () => {
        const text = dedent`
            const x = 5;
            let y = 10;
            console.log('break');
        `
        const { originalText, changes } = getTextDocumentChanges(text)
        const diffs = strategy.getDiffHunks({
            uri: vscode.Uri.parse('file://test.ts'),
            oldContent: originalText,
            changes,
        })
        expect(diffs.length).toBe(0)
    })

    it('handles single change', () => {
        const text = dedent`
            const x = 5;
            <DC>var</DC><IC>let</IC> y = 10;
            console.log('break');
        `
        const { originalText, changes } = getTextDocumentChanges(text)
        const diffs = strategy.getDiffHunks({
            uri: vscode.Uri.parse('file://test.ts'),
            oldContent: originalText,
            changes,
        })
        expect(diffs.length).toBe(1)
        expect(processComputedDiff(diffs[0].diff.toString())).toMatchInlineSnapshot(`
            "2-| var y = 10;
            2+| let y = 10;"
        `)
    })

    it('handles changes at file boundaries', () => {
        const text = dedent`
            <DC></DC><IC>// First line added\n</IC>const x = 5;
            let y = 10;
            console.log('break');<DC>\nfinal line removed</DC>
        `
        const { originalText, changes } = getTextDocumentChanges(text)
        const diffs = strategy.getDiffHunks({
            uri: vscode.Uri.parse('file://test.ts'),
            oldContent: originalText,
            changes,
        })
        expect(diffs.length).toBe(2)
        expect(processComputedDiff(diffs[0].diff.toString())).toMatchInlineSnapshot(`
          "4-| console.log('break');
          5-| final line removed
          4+| console.log('break');"
        `)
        expect(processComputedDiff(diffs[1].diff.toString())).toMatchInlineSnapshot(`
          "1+| // First line added
          2 | const x = 5;
          3 | let y = 10;
          4 | console.log('break');"
        `)
    })

    it('handles multiple adjacent changes', () => {
        const text = dedent`
            const x = 5;
            <DC>var</DC><IC>let</IC> y = <DC>10</DC><IC>20</IC>;
            console.log('break');
        `
        const { originalText, changes } = getTextDocumentChanges(text)
        const diffs = strategy.getDiffHunks({
            uri: vscode.Uri.parse('file://test.ts'),
            oldContent: originalText,
            changes,
        })
        expect(diffs.length).toBe(1)
        expect(processComputedDiff(diffs[0].diff.toString())).toMatchInlineSnapshot(`
          "2-| var y = 10;
          2+| let y = 20;"
        `)
    })
})
