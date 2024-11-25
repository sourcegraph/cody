import { describe, expect, it } from 'vitest'
import { Uri } from 'vscode'
import { range } from '../../../../../testutils/textDocument'
import { AutoeditWithShortTermDiffStrategy } from './auotedit-short-term-diff'
import type { TextDocumentChange } from './recent-edits-diff-strategy'

describe('AutoeditWithShortTermDiffStrategy', () => {
    const strategy = new AutoeditWithShortTermDiffStrategy()
    const mockUri = Uri.parse('file:///test.txt')

    const createChange = (timestamp: number, oldText: string, text: string) => ({
        timestamp,
        change: {
            range: range(0, 0, 0, 0),
            text,
            rangeLength: oldText.length,
            rangeOffset: 0,
        },
    })

    it('should divide changes into short-term and long-term windows', () => {
        const now = Date.now()
        const initialContent = 'initial content'
        const changes: TextDocumentChange[] = [
            createChange(now - 10000, initialContent, 'change 1'),
            createChange(now - 2000, 'change 1', 'change 2'),
        ]

        const hunks = strategy.getDiffHunks({
            uri: mockUri,
            oldContent: initialContent,
            changes,
        })

        expect(hunks).toHaveLength(2)
        expect(hunks[0].diff.toString()).toMatchInlineSnapshot(`
            "1-| initial content
            1+| change 1"
        `)
        expect(hunks[1].diff.toString()).toMatchInlineSnapshot(`
            "1-| change 1
            1+| change 2"
        `)
    })
})
