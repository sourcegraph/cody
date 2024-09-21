import dedent from 'dedent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import { Position, Selection } from '../../../../testutils/mocks'
import { document } from '../../../test-helpers'
import { RecentCopyRetriever } from './recent-copy'

const FIVE_MINUTES = 5 * 60 * 1000
const MAX_SELECTIONS = 2

describe('RecentCopyRetriever', () => {
    let retriever: RecentCopyRetriever
    let onDidChangeTextEditorSelection: any
    let mockClipboardContent: string
    let onDidRenameFiles: (event: vscode.FileRenameEvent) => void
    let onDidDeleteFiles: (event: vscode.FileDeleteEvent) => void

    const createMockSelection = (
        startLine: number,
        startChar: number,
        endLine: number,
        endChar: number
    ) => new Selection(new Position(startLine, startChar), new Position(endLine, endChar))

    const simulateSelectionChange = async (testDocument: any, selection: Selection) => {
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocument },
            selections: [selection],
        })
    }

    beforeEach(() => {
        vi.useFakeTimers()

        retriever = new RecentCopyRetriever(
            {
                maxAgeMs: FIVE_MINUTES,
                maxSelections: MAX_SELECTIONS,
            },
            {
                onDidChangeTextEditorSelection: (_onDidChangeTextEditorSelection: any) => {
                    onDidChangeTextEditorSelection = _onDidChangeTextEditorSelection
                    return { dispose: vi.fn() }
                },
            },
            {
                onDidRenameFiles(listener) {
                    onDidRenameFiles = listener
                    return { dispose: () => {} }
                },
                onDidDeleteFiles(listener) {
                    onDidDeleteFiles = listener
                    return { dispose: () => {} }
                },
            }
        )
        // Mock the getClipboardContent method to get the vscode clipboard content
        vi.spyOn(retriever, 'getClipboardContent').mockImplementation(() =>
            Promise.resolve(mockClipboardContent)
        )
    })

    afterEach(() => {
        retriever.dispose()
    })

    it('should retrieve the copied text if it exists in tracked selections', async () => {
        mockClipboardContent = dedent`
            function foo() {
                console.log('foo')
            }
        `
        const testDocument = document(mockClipboardContent)
        const selection = createMockSelection(0, 0, 2, 1)

        await simulateSelectionChange(testDocument, selection)
        const snippets = await retriever.retrieve()

        expect(snippets).toHaveLength(1)
        expect(snippets[0]).toEqual({
            content: mockClipboardContent,
            uri: testDocument.uri,
            startLine: selection.start.line,
            endLine: selection.end.line,
            identifier: retriever.identifier,
        })
    })

    it('should return null when copied content is not in tracked selections', async () => {
        const doc1 = document('document 1 content', 'doc1.ts')
        const doc2 = document('document 2 content', 'doc2.ts')
        const doc3 = document('document 3 content', 'doc3.ts')

        await simulateSelectionChange(doc1, createMockSelection(0, 0, 0, 5))
        await simulateSelectionChange(doc2, createMockSelection(0, 0, 0, 5))
        await simulateSelectionChange(doc3, createMockSelection(0, 0, 0, 5))

        mockClipboardContent = doc1.getText()
        const snippets = await retriever.retrieve()

        expect(snippets).toHaveLength(0)
    })

    it('should respect maxAgeMs and remove old selections', async () => {
        const doc = document('old content')
        await simulateSelectionChange(doc, createMockSelection(0, 0, 0, 5))

        vi.advanceTimersByTime(FIVE_MINUTES + 1000) // Advance time beyond maxAgeMs

        mockClipboardContent = 'old content'
        const snippets = await retriever.retrieve()

        expect(snippets).toHaveLength(0)
    })
})
