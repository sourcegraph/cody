import dedent from 'dedent'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type * as vscode from 'vscode'

import { testFileUri } from '@sourcegraph/cody-shared'

import { Position } from '../../../../testutils/mocks'
import { range, withPosixPaths } from '../../../../testutils/textDocument'
import { document } from '../../../test-helpers'

import { LspLightRetriever } from './lsp-light-retriever'

const document1Uri = testFileUri('document1.ts')
const document2Uri = testFileUri('document2.ts')

const disposable = {
    dispose: () => {},
}

describe('LspLightRetriever', () => {
    let testDocuments: {
        document1: vscode.TextDocument
        document2: vscode.TextDocument
    }

    let retriever: LspLightRetriever
    let onDidChangeTextEditorSelection: any
    let onDidChangeTextDocument: any
    let getGraphContextFromRange: Mock

    beforeEach(() => {
        vi.useFakeTimers()

        testDocuments = {
            document1: document(
                dedent`
                    export class Test {
                        foo() {
                            console.log('foo')
                        }
                        bar() {
                            console.log('bar')
                        }
                    }
                `,
                'typescript',
                document1Uri.toString()
            ),
            document2: document(
                dedent`
                    export class TestTwo {
                        foo() {
                            console.log('foo2')
                        }
                        bar() {
                            console.log('bar2')
                        }
                    }
                `,
                'typescript',
                document2Uri.toString()
            ),
        }

        getGraphContextFromRange = vi
            .fn()
            .mockImplementation(() =>
                Promise.resolve([{ symbolName: 'foo', content: ['foo(): void'], uri: document1Uri.toString() }])
            )
        retriever = new LspLightRetriever(
            {
                // Mock VS Code event handlers so we can fire them manually
                onDidChangeTextEditorSelection: (_onDidChangeTextEditorSelection: any) => {
                    onDidChangeTextEditorSelection = _onDidChangeTextEditorSelection
                    return disposable
                },
            },
            {
                onDidChangeTextDocument: (_onDidChangeTextDocument: any) => {
                    onDidChangeTextDocument = _onDidChangeTextDocument
                    return disposable
                },
            },
            getGraphContextFromRange
        )
    })
    afterEach(() => {
        retriever.dispose()
    })

    it('calls the LSP for context of the current and previous lines', async () => {
        await retriever.retrieve({
            document: testDocuments.document1,
            position: new Position(1, 0),
            hints: { maxChars: 100 },
        })

        expect(getGraphContextFromRange).toHaveBeenCalledWith(
            testDocuments.document1,
            range(0, 0, 0, 19),
            expect.anything()
        )
        expect(getGraphContextFromRange).toHaveBeenCalledWith(
            testDocuments.document1,
            range(1, 0, 1, 11),
            expect.anything()
        )
    })

    it('preloads the results when navigating to a line', async () => {
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })

        // Preloading is debounced so we need to advance the timer manually
        await vi.advanceTimersToNextTimerAsync()
        expect(getGraphContextFromRange).toHaveBeenCalledWith(
            testDocuments.document1,
            range(0, 0, 0, 19),
            expect.anything()
        )
        expect(getGraphContextFromRange).toHaveBeenCalledWith(
            testDocuments.document1,
            range(1, 0, 1, 11),
            expect.anything()
        )

        getGraphContextFromRange.mockClear()

        expect(
            withPosixPaths(
                await retriever.retrieve({
                    document: testDocuments.document1,
                    position: new Position(1, 0),
                    hints: { maxChars: 100 },
                })
            )
        ).toMatchInlineSnapshot(`
          [
            {
              "content": "foo(): void",
              "fileName": "/document1.ts",
              "fileUri": {
                "$mid": 1,
                "path": "/document1.ts",
                "scheme": "file",
              },
              "symbol": "foo",
            },
          ]
        `)
        expect(getGraphContextFromRange).not.toHaveBeenCalled()
    })

    it('evicts the cache when changing a different file', async () => {
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })
        await vi.advanceTimersToNextTimerAsync()

        // Expect the current and previous line of document 1 to be preloaded
        expect(getGraphContextFromRange).toHaveBeenCalledWith(
            testDocuments.document1,
            range(0, 0, 0, 19),
            expect.anything()
        )
        expect(getGraphContextFromRange).toHaveBeenCalledWith(
            testDocuments.document1,
            range(1, 0, 1, 11),
            expect.anything()
        )
        getGraphContextFromRange.mockClear()

        await onDidChangeTextDocument({
            document: testDocuments.document2,
            contentChanges: [],
        })

        expect(
            withPosixPaths(
                await retriever.retrieve({
                    document: testDocuments.document1,
                    position: new Position(1, 0),
                    hints: { maxChars: 100 },
                })
            )
        ).toMatchInlineSnapshot(`
          [
            {
              "content": "foo(): void",
              "fileName": "/document1.ts",
              "fileUri": {
                "$mid": 1,
                "path": "/document1.ts",
                "scheme": "file",
              },
              "symbol": "foo",
            },
          ]
        `)

        expect(getGraphContextFromRange).toHaveBeenCalledWith(
            testDocuments.document1,
            range(0, 0, 0, 19),
            expect.anything()
        )
    })

    it('aborts the request navigating to a different line', async () => {
        let abortSignal: any
        getGraphContextFromRange = getGraphContextFromRange.mockImplementation((_doc, _range, _abortSignal) => {
            abortSignal = _abortSignal
            return new Promise(() => {})
        })

        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })
        await vi.advanceTimersToNextTimerAsync()

        // Expect the current and previous line of document 1 to be preloaded
        expect(getGraphContextFromRange).toHaveBeenCalledWith(
            testDocuments.document1,
            range(0, 0, 0, 19),
            expect.anything()
        )
        expect(getGraphContextFromRange).toHaveBeenCalledWith(
            testDocuments.document1,
            range(1, 0, 1, 11),
            expect.anything()
        )
        getGraphContextFromRange.mockClear()

        // Move to a different line
        getGraphContextFromRange.mockImplementation(() => Promise.resolve([]))
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 2, character: 0 } }],
        })
        await vi.advanceTimersToNextTimerAsync()

        expect(abortSignal.aborted).toBe(true)
    })
})
