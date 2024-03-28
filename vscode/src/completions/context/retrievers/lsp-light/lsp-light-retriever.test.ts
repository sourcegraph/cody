import dedent from 'dedent'
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { testFileUri } from '@sourcegraph/cody-shared'

import { Position } from '../../../../testutils/mocks'
import { withPosixPaths } from '../../../../testutils/textDocument'
import { document, initTreeSitterParser } from '../../../test-helpers'

import { parseDocument } from '../../../../tree-sitter/parse-tree-cache'
import { LspLightRetriever } from './lsp-light-retriever'

const document1Uri = testFileUri('document1.ts')
const document2Uri = testFileUri('document2.ts')

const disposable = {
    dispose: () => {},
}

describe('LspLightRetriever', () => {
    beforeAll(async () => {
        await initTreeSitterParser()
    })

    let testDocuments: {
        document1: vscode.TextDocument
        document2: vscode.TextDocument
    }

    let retriever: LspLightRetriever
    let onDidChangeTextEditorSelection: any
    let getSymbolContextSnippets: Mock

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

        getSymbolContextSnippets = vi
            .fn()
            .mockImplementation(() =>
                Promise.resolve([
                    { symbolName: 'log', content: ['log(): void'], uri: document1Uri.toString() },
                ])
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
                    return disposable
                },
            },
            getSymbolContextSnippets
        )

        parseDocument(testDocuments.document1)
        parseDocument(testDocuments.document2)
    })
    afterEach(() => {
        retriever.dispose()
    })

    it('calls the LSP for context of last N identifiers before the cursor position', async () => {
        await retriever.retrieve({
            document: testDocuments.document1,
            position: new Position(1, 0),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(getSymbolContextSnippets).toHaveBeenCalledWith({
            symbolsSnippetRequests: [
                {
                    uri: expect.anything(),
                    languageId: 'typescript',
                    nodeType: 'type_identifier',
                    symbolName: 'Test',
                    position: new Position(0, 13),
                },
            ],
            recursionLimit: expect.any(Number),
            abortSignal: expect.anything(),
        })
    })

    it('preloads the results when navigating to a line', async () => {
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 3, character: 0 } }],
        })

        // Preloading is debounced so we need to advance the timer manually
        await vi.advanceTimersToNextTimerAsync()
        expect(getSymbolContextSnippets).toHaveBeenCalledWith({
            symbolsSnippetRequests: [
                {
                    uri: expect.anything(),
                    languageId: 'typescript',
                    nodeType: 'property_identifier',
                    symbolName: 'log',
                    position: new Position(2, 16),
                },
            ],
            recursionLimit: expect.any(Number),
            abortSignal: expect.anything(),
        })

        getSymbolContextSnippets.mockClear()

        const [snippet] = await retriever.retrieve({
            document: testDocuments.document1,
            position: new Position(3, 0),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(withPosixPaths(snippet)).toMatchObject({
            content: ['log(): void'],
            symbolName: 'log',
            uri: document1Uri.toString(),
        })
    })

    it('aborts the request navigating to a different line', async () => {
        let abortSignal: any
        getSymbolContextSnippets = getSymbolContextSnippets.mockImplementation(
            ({ abortSignal: _abortSignal }) => {
                abortSignal = _abortSignal
                return new Promise(() => {})
            }
        )

        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })
        await vi.advanceTimersToNextTimerAsync()

        expect(getSymbolContextSnippets).toHaveBeenCalledWith({
            symbolsSnippetRequests: [
                {
                    uri: expect.anything(),
                    languageId: 'typescript',
                    nodeType: 'type_identifier',
                    symbolName: 'Test',
                    position: new Position(0, 13),
                },
            ],
            recursionLimit: expect.any(Number),
            abortSignal: expect.anything(),
        })

        getSymbolContextSnippets.mockClear()

        // Move to a different line
        getSymbolContextSnippets.mockImplementation(() => Promise.resolve([]))
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 2, character: 0 } }],
        })
        await vi.advanceTimersToNextTimerAsync()

        expect(abortSignal.aborted).toBe(true)
    })
})
