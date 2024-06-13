import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { document } from '../../completions/test-helpers'
import type { Edit } from '../line-diff'
import { getFormattedReplacement } from './get-formatted-replacement'

const getDocumentRange = (document: vscode.TextDocument): vscode.Range => {
    const firstLine = document.lineAt(0)
    const lastLine = document.lineAt(document.lineCount - 1)
    return new vscode.Range(firstLine.range.start, lastLine.range.end)
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
        const mockEdits: Edit[] = [
            { range: new vscode.Range(1, 0, 2, 0), text: '', type: 'insertion' },
            { range: new vscode.Range(2, 13, 2, 14), text: '', type: 'insertion' },
            { range: new vscode.Range(3, 13, 3, 14), text: '', type: 'insertion' },
            { range: new vscode.Range(4, 14, 4, 15), text: '', type: 'insertion' },
        ]
        const actualFormattedText = await getFormattedReplacement(
            mockDocument,
            originalText,
            getDocumentRange(mockDocument),
            mockEdits
        )

        expect(actualFormattedText).toBe(expectedFormattedText)
    })
})
