import dedent from 'dedent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import { Position, Selection } from '../../../../testutils/mocks'
import { document } from '../../../test-helpers'
import { RecentCopyRetriever } from './recent-copy'

const FIVE_MINUTES = 5 * 60 * 1000
const MAX_SELECTIONS = 2

const disposable = {
    dispose: () => {},
}

describe('RecentCopyRetriever', () => {
    let retriever: RecentCopyRetriever
    let onDidChangeTextEditorSelection: any
    let mockClipboardContent: string

    const createMockSelection = (
        startLine: number,
        startChar: number,
        endLine: number,
        endChar: number
    ) => new Selection(new Position(startLine, startChar), new Position(endLine, endChar))

    const createMockSelectionForDocument = (document: vscode.TextDocument) => {
        return createMockSelection(
            0,
            0,
            document.lineCount - 1,
            document.lineAt(document.lineCount - 1).text.length
        )
    }

    const getDocumentWithUri = (content: string, uri: string, language = 'typescript') => {
        return document(content, language, uri)
    }

    const simulateSelectionChange = async (testDocument: vscode.TextDocument, selection: Selection) => {
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocument },
            selections: [selection],
        })
        // Preloading is debounced so we need to advance the timer manually
        await vi.advanceTimersToNextTimerAsync()
    }

    beforeEach(() => {
        vi.useFakeTimers()

        retriever = new RecentCopyRetriever(
            {
                maxAgeMs: FIVE_MINUTES,
                maxSelections: MAX_SELECTIONS,
            },
            {
                // Mock VS Code event handlers so we can fire them manually
                onDidChangeTextEditorSelection: (_onDidChangeTextEditorSelection: any) => {
                    onDidChangeTextEditorSelection = _onDidChangeTextEditorSelection
                    return disposable
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
        const testDocument = document(dedent`
            function foo() {
                console.log('foo')
            }
        `)
        mockClipboardContent = testDocument.getText()
        const selection = createMockSelectionForDocument(testDocument)
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
        const doc1 = getDocumentWithUri('document 1 content', 'doc1.ts')
        const doc2 = getDocumentWithUri('document 2 content', 'doc2.ts')
        const doc3 = getDocumentWithUri('document 3 content', 'doc3.ts')

        await simulateSelectionChange(doc1, createMockSelectionForDocument(doc1))
        await simulateSelectionChange(doc2, createMockSelectionForDocument(doc2))
        await simulateSelectionChange(doc3, createMockSelectionForDocument(doc3))

        mockClipboardContent = doc1.getText()
        const snippets = await retriever.retrieve()

        expect(snippets).toHaveLength(0)
    })

    it('should respect maxAgeMs and remove old selections', async () => {
        const doc1 = getDocumentWithUri('old content', 'doc1.ts')
        await simulateSelectionChange(doc1, createMockSelectionForDocument(doc1))
        vi.advanceTimersByTime(FIVE_MINUTES + 1000) // Advance time beyond maxAgeMs
        const doc2 = getDocumentWithUri('new content', 'doc2.ts')
        await simulateSelectionChange(doc2, createMockSelectionForDocument(doc2))

        const trackedSelections = retriever.getTrackedSelections()
        expect(trackedSelections).toHaveLength(1)
        expect(trackedSelections[0].content).toBe('new content')
    })

    it('should keep tracked selections sorted by timestamp', async () => {
        const doc1 = getDocumentWithUri('document 1 content', 'doc1.ts')
        const doc2 = getDocumentWithUri('document 2 content', 'doc2.ts')
        const doc3 = getDocumentWithUri('document 3 content', 'doc3.ts')

        await simulateSelectionChange(doc1, createMockSelectionForDocument(doc1))
        await simulateSelectionChange(doc2, createMockSelectionForDocument(doc2))
        await simulateSelectionChange(doc3, createMockSelectionForDocument(doc3))

        const trackedSelections = retriever.getTrackedSelections()

        expect(trackedSelections).toHaveLength(2)
        expect(trackedSelections[0].content).toBe('document 3 content')
        expect(trackedSelections[1].content).toBe('document 2 content')
    })

    it('should remove outdated selections when scrolling through a document', async () => {
        const doc = document(dedent`
            line1
            line2
            line3
            line4
            line5
        `)

        // Simulate scrolling through the document
        for (let i = 0; i < 5; i++) {
            const selection = createMockSelection(0, 0, i, 5) // Select each line
            await simulateSelectionChange(doc, selection)
        }

        const trackedSelections = retriever.getTrackedSelections()

        // We expect only the most recent selections to be kept (default is 2)
        expect(trackedSelections).toHaveLength(1)
        expect(trackedSelections[0].content).toBe(doc.getText())
    })
})
