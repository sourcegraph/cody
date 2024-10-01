import dedent from 'dedent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { Position, Range } from '../../../../testutils/mocks'
import { getCurrentDocContext } from '../../../get-current-doc-context'
import { document } from '../../../test-helpers'
import type { ContextRetrieverOptions } from '../../../types'
import { RecentViewPortRetriever } from './recent-view-port'

const documentList = [
    document(
        dedent`
        function hello() {
            console.log('Hello, world!');
        }
    `,
        'typescript',
        'file:///test1.ts'
    ),
    document(
        dedent`
        class TestClass {
            constructor() {
                this.name = 'Test';
            }
        }
    `,
        'typescript',
        'file:///test2.ts'
    ),
    document(
        dedent`
        const numbers = [1, 2, 3, 4, 5];
        const sum = numbers.reduce((a, b) => a + b, 0);
    `,
        'typescript',
        'file:///test3.ts'
    ),
]

describe('RecentViewPortRetriever', () => {
    let retriever: RecentViewPortRetriever
    let onDidChangeTextEditorVisibleRanges: any

    const createMockVisibleRange = (doc: vscode.TextDocument, startLine: number, endLine: number) => {
        return new Range(
            new Position(startLine, 0),
            new Position(endLine, doc.lineAt(endLine).text.length)
        )
    }

    const getContextRetrieverOptionsFromDoc = (doc: vscode.TextDocument): ContextRetrieverOptions => {
        return {
            document: doc,
            position: new Position(0, 0),
            docContext: getCurrentDocContext({
                document: doc,
                position: new Position(0, 0),
                maxPrefixLength: 100,
                maxSuffixLength: 0,
            }),
        }
    }

    beforeEach(() => {
        vi.useFakeTimers()

        vi.spyOn(vscode.workspace, 'openTextDocument').mockImplementation(((uri: vscode.Uri) => {
            if (uri?.toString().includes('test1.ts')) {
                return Promise.resolve(documentList[0])
            }
            if (uri?.toString().includes('test2.ts')) {
                return Promise.resolve(documentList[1])
            }
            if (uri?.toString().includes('test3.ts')) {
                return Promise.resolve(documentList[2])
            }
            return Promise.resolve(documentList[0])
        }) as any)
        retriever = new RecentViewPortRetriever({
            maxTrackedViewPorts: 2,
            maxRetrievedViewPorts: 2,
            window: {
                onDidChangeTextEditorVisibleRanges: (_onDidChangeTextEditorVisibleRanges: any) => {
                    onDidChangeTextEditorVisibleRanges = _onDidChangeTextEditorVisibleRanges
                    return { dispose: () => {} }
                },
            },
        })
    })

    afterEach(() => {
        retriever.dispose()
    })

    const simulateVisibleRangeChange = async (
        testDocument: vscode.TextDocument,
        visibleRanges: vscode.Range[]
    ) => {
        onDidChangeTextEditorVisibleRanges({
            textEditor: { document: testDocument },
            visibleRanges,
        })
        // Preloading is debounced so we need to advance the timer manually
        await vi.advanceTimersToNextTimerAsync()
    }

    it('should ignore the current document', async () => {
        const doc = documentList[1]
        const visibleRange = createMockVisibleRange(doc, 1, 2)
        await simulateVisibleRangeChange(doc, [visibleRange])

        const snippets = await retriever.retrieve(getContextRetrieverOptionsFromDoc(doc))

        expect(snippets).toHaveLength(0)
    })

    it('should retrieve the most recent visible range', async () => {
        const doc = documentList[1]
        const visibleRange = createMockVisibleRange(doc, 1, 2)
        await simulateVisibleRangeChange(doc, [visibleRange])
        const doc2 = documentList[0]
        const visibleRange2 = createMockVisibleRange(doc2, 0, 1)
        await simulateVisibleRangeChange(doc2, [visibleRange2])

        const snippets = await retriever.retrieve(getContextRetrieverOptionsFromDoc(doc2))

        expect(snippets).toHaveLength(1)
        expect(snippets[0]).toMatchObject({
            uri: doc.uri,
            startLine: 1,
            endLine: 2,
            identifier: retriever.identifier,
        })
        expect(snippets[0].content).toMatchInlineSnapshot(dedent`
            "    constructor() {
                    this.name = 'Test';"
        `)
    })

    it('should update existing viewport when revisited', async () => {
        const doc = documentList[0]
        await simulateVisibleRangeChange(doc, [createMockVisibleRange(doc, 0, 1)])
        await simulateVisibleRangeChange(doc, [createMockVisibleRange(doc, 1, 2)])
        const doc2 = documentList[1]
        const visibleRange2 = createMockVisibleRange(doc2, 0, 1)
        await simulateVisibleRangeChange(doc2, [visibleRange2])

        const snippets = await retriever.retrieve(getContextRetrieverOptionsFromDoc(doc2))

        expect(snippets).toHaveLength(1)
        expect(snippets[0].startLine).toBe(1)
        expect(snippets[0].endLine).toBe(2)
    })

    it('should handle empty visible ranges', async () => {
        const doc = documentList[0]
        await simulateVisibleRangeChange(doc, [])

        const snippets = await retriever.retrieve(getContextRetrieverOptionsFromDoc(doc))

        expect(snippets).toHaveLength(0)
    })

    it('should respect MAX_TRACKED_FILES limit', async () => {
        const doc1 = documentList[0]
        const doc2 = documentList[1]
        const doc3 = documentList[2]

        await simulateVisibleRangeChange(doc1, [createMockVisibleRange(doc1, 0, 1)])
        await simulateVisibleRangeChange(doc2, [createMockVisibleRange(doc2, 0, 1)])
        await simulateVisibleRangeChange(doc3, [createMockVisibleRange(doc3, 0, 1)])

        const snippets = await retriever.retrieve(getContextRetrieverOptionsFromDoc(doc1))

        expect(snippets).toHaveLength(2)
        expect(snippets[0].uri).toEqual(doc3.uri)
        expect(snippets[1].uri).toEqual(doc2.uri)
    })
})
