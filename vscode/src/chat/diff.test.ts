import { describe, expect, test } from 'vitest'
import * as vscode from 'vscode'
import type { Edit } from '../non-stop/line-diff'
import { diffInChat } from './diff'

describe('diffInChat', () => {
    // Mock VSCode TextDocument
    const createMockDocument = (content: string): vscode.TextDocument =>
        ({
            getText: () => content,
            // Add other required TextDocument properties as needed
        }) as vscode.TextDocument

    test('formats single line insertion correctly', () => {
        const content = `line1
        line2
        line3`
        const document = createMockDocument(content)
        const diffs: Edit[] = [
            {
                type: 'insertion',
                text: 'new line',
                range: new vscode.Range(1, 0, 1, 0),
            },
        ]

        const result = diffInChat(diffs, document)
        const expected = `Here is the proposed change:

\`\`\`diff
 line1
+ new line
 line3
\`\`\``

        expect(result).toBe(expected)
    })

    test('formats single line deletion correctly', () => {
        const originalDoc = `line1
        line2
        line3`
        const document = createMockDocument(originalDoc)
        const diffs: Edit[] = [
            {
                type: 'deletion',
                range: new vscode.Range(1, 0, 1, 0),
                oldText: 'line2',
            },
        ]

        const result = diffInChat(diffs, document)
        const expected = `Here is the proposed change:

\`\`\`diff
 line1
- line1
- line2
- line3
 line3
\`\`\``

        expect(result).toBe(expected)
    })

    test('formats decorated replacement correctly', () => {
        const document = createMockDocument('line1\nold line\nline3')
        const diffs: Edit[] = [
            {
                type: 'decoratedReplacement',
                text: 'new line',
                oldText: 'old line',
                range: new vscode.Range(1, 0, 1, 0),
            },
        ]

        const result = diffInChat(diffs, document)
        const expected = `Here is the proposed change:

\`\`\`diff
 line1
- old line
+ new line
 line3
\`\`\``

        expect(result).toBe(expected)
    })

    test('shows compact diff with context when showFullFile is false', () => {
        const document = createMockDocument('line1\nline2\nline3\nline4\nline5\nline6\nline7')
        const diffs: Edit[] = [
            {
                type: 'insertion',
                text: 'new line',
                range: new vscode.Range(3, 0, 3, 0),
            },
        ]

        const result = diffInChat(diffs, document, { showFullFile: false })
        const expected = `Here is the proposed change:

\`\`\`diff
 line1
 line2
 line3
+ new line
 line5
 line6
\`\`\``

        expect(result).toBe(expected)
    })
})
