import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { AutoeditWithShortTermDiffStrategy } from './auotedit-short-term-diff'
import { getTextDocumentChangesForText } from './helper'

const processComputedDiff = (text: string): string => {
    const lines = text.split('\n')
    const updatedText = lines.filter(line => !line.includes('\\ No newline at end of file')).join('\n')
    return updatedText
}

describe('AutoeditWithShortTermDiffStrategy', () => {
    const strategy = new AutoeditWithShortTermDiffStrategy()

    it('handles multiple changes across different lines', () => {
        const text = dedent`
            <DC>let</DC><IC>const</IC> x = 5;
            <DC>var</DC><IC>let</IC> y = 10;
            console.log('break');
            <DC>let</DC><IC>const</IC> z = 5;
            console.log(<DC>x +</DC><IC>x *</IC> y);
        `
        const { originalText, changes } = getTextDocumentChangesForText(text)
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
})
