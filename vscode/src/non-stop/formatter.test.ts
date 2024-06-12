import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { document } from '../completions/test-helpers'
import { getFormattedReplacement } from './formatter'

const getDocumentRange = (document: vscode.TextDocument): vscode.Range => {
    const firstLine = document.lineAt(0)
    const lastLine = document.lineAt(document.lineCount - 1)
    return new vscode.Range(firstLine.range.start, lastLine.range.end)
}

const mockFormatter =
    (result: vscode.TextEdit[]) =>
    (document: vscode.TextDocument, range: vscode.Range): Promise<vscode.TextEdit[]> => {
        return Promise.resolve(result)
    }

describe('getFormattedReplacement', () => {
    it('should return the correct replacement', async () => {
        const originalText = dedent`
            interface Test {

                a: string;
                b: number;
                c: boolean;
            }`

        // Without semi-colons
        const expectedFormattedText = dedent`
        interface Test {
            a: string
            b: number
            c: boolean
        }`

        const mockDocument = document(originalText)
        const actualFormattedText = await getFormattedReplacement(
            mockDocument,
            originalText,
            getDocumentRange(mockDocument),
            mockFormatter([
                { range: new vscode.Range(1, 0, 2, 0), newText: '' },
                { range: new vscode.Range(2, 13, 2, 14), newText: '' },
                { range: new vscode.Range(3, 13, 3, 14), newText: '' },
                { range: new vscode.Range(4, 14, 4, 15), newText: '' },
            ])
        )

        expect(actualFormattedText).toBe(expectedFormattedText)
    })
})
