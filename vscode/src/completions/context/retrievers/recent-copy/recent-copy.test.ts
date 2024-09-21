import dedent from 'dedent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Position } from '../../../../testutils/mocks'
import { document } from '../../../test-helpers'
import { RecentCopyRetriever } from './recent-copy'

const FIVE_MINUTES = 5 * 60 * 1000

describe('RecentCopyRetriever', () => {
    let retriever: RecentCopyRetriever
    let onDidChangeTextEditorSelection: any
    let mockClipboardContent: string

    beforeEach(() => {
        vi.useFakeTimers()

        retriever = new RecentCopyRetriever(
            {
                maxAgeMs: FIVE_MINUTES,
                maxSelections: 10,
            },
            {
                onDidChangeTextEditorSelection: (_onDidChangeTextEditorSelection: any) => {
                    onDidChangeTextEditorSelection = _onDidChangeTextEditorSelection
                    return { dispose: vi.fn() }
                },
            }
        )

        // Mock the getClipboardContent method
        vi.spyOn(retriever, 'getClipboardContent').mockImplementation(() =>
            Promise.resolve(mockClipboardContent)
        )
    })

    afterEach(() => {
        retriever.dispose()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('should retrieve the copied text if it exists in tracked selections', async () => {
        mockClipboardContent = dedent`
            function foo() {
                console.log('foo')
            }
        `
        const testDocument = document(mockClipboardContent)

        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocument },
            selections: [
                {
                    active: new Position(0, 0),
                    anchor: new Position(2, 1),
                    start: new Position(0, 0),
                    end: new Position(2, 1),
                },
            ],
        })
        const snippets = await retriever.retrieve()
        expect(snippets).toHaveLength(1)
        expect(snippets[0].content).toBe(mockClipboardContent)
        expect(snippets[0].uri).toBe(testDocument.uri)
        expect(snippets[0].startLine).toBe(0)
        expect(snippets[0].endLine).toBe(2)
    })
})
