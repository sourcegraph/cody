import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import type * as rpc from 'vscode-jsonrpc/node'
import * as lsp from 'vscode-languageserver-protocol/node'

import { Position, Uri, vsCodeMocks } from '../../../../testutils/mocks'
import { parseDocument } from '../../../../tree-sitter/parse-tree-cache'
import { documentFromFilePath, initTreeSitterParser } from '../../../test-helpers'

import * as lspCommands from '../../../../graph/lsp/lsp-commands'
import { locationLinkToLocation } from '../../../../graph/lsp/lsp-commands'
import { LspLightRetriever } from './lsp-light-retriever'
import { initialize, openWorkspaceFiles, startLanguageServer } from './lsp-test-helpers'

vi.mock('vscode', () => ({
    ...vsCodeMocks,
    workspace: {
        ...vsCodeMocks.workspace,
        openTextDocument(uri) {
            if (uri && typeof uri !== 'string' && 'fsPath' in uri) {
                return Promise.resolve(documentFromFilePath(uri.fsPath))
            }

            throw new Error('vscode.workspace.openTextDocument: uri is required')
        },
    } satisfies Pick<typeof vscode.workspace, 'openTextDocument'>,
}))

const disposable = {
    dispose: () => {},
}

// pnpm vitest vscode/src/completions/context/retrievers/lsp-light/lsp-light-retriever.integration.test.ts --disableConsoleIntercept --hideSkippedTests --reporter=basic
describe('LspLightRetriever', () => {
    let connection: rpc.MessageConnection
    let mainFileUri: Uri
    let mainDocument: vscode.TextDocument
    let retriever: LspLightRetriever
    let onDidChangeTextEditorSelection: any

    beforeAll(async () => {
        await initTreeSitterParser()

        connection = startLanguageServer()
        await initialize(connection)
        const workspaceFileURIs = await openWorkspaceFiles(connection)

        mainFileUri = workspaceFileURIs.find(uri => uri.fsPath.endsWith('main.ts'))!
        mainDocument = documentFromFilePath(mainFileUri.fsPath)

        function processLocationsResponse(
            response: lsp.Definition | lsp.LocationLink[] | null
        ): vscode.Location[] {
            if (response === null) {
                return []
            }

            const locations = (Array.isArray(response) ? response : [response]) as unknown as (
                | vscode.Location
                | vscode.LocationLink
            )[]

            return locations.map(locationLinkToLocation).map(location => {
                if (typeof location.uri === 'string') {
                    return {
                        ...location,
                        uri: Uri.parse(location.uri),
                    }
                }

                return location
            })
        }

        // TODO: extract the LSP plumbing wrappers into a separate file.
        vi.spyOn(lspCommands, 'getHover').mockImplementation(
            async (uri: vscode.Uri, position: vscode.Position) => {
                const params: lsp.TextDocumentPositionParams = {
                    textDocument: { uri: uri.toString() },
                    position,
                }

                const response = await connection.sendRequest(lsp.HoverRequest.type, params)
                const hoverArray = (response ? [response] : []) as vscode.Hover[]
                return hoverArray.map(hover => {
                    if (Array.isArray(hover.contents)) {
                        return hover
                    }

                    return {
                        ...hover,
                        contents: [hover.contents],
                    }
                })
            }
        )

        vi.spyOn(lspCommands, 'getTypeDefinitionLocations').mockImplementation(
            async (uri: vscode.Uri, position: vscode.Position) => {
                const params: lsp.TextDocumentPositionParams = {
                    textDocument: { uri: uri.toString() },
                    position,
                }

                const response = await connection.sendRequest(lsp.TypeDefinitionRequest.type, params)
                return processLocationsResponse(response)
            }
        )

        vi.spyOn(lspCommands, 'getDefinitionLocations').mockImplementation(
            async (uri: vscode.Uri, position: vscode.Position) => {
                const params: lsp.TextDocumentPositionParams = {
                    textDocument: { uri: uri.toString() },
                    position,
                }

                const response = await connection.sendRequest(lsp.DefinitionRequest.type, params)
                return processLocationsResponse(response)
            }
        )

        vi.spyOn(lspCommands, 'getImplementationLocations').mockImplementation(
            async (uri: vscode.Uri, position: vscode.Position) => {
                const params: lsp.TextDocumentPositionParams = {
                    textDocument: { uri: uri.toString() },
                    position,
                }

                const response = await connection.sendRequest(lsp.ImplementationRequest.type, params)
                return processLocationsResponse(response)
            }
        )
    })

    afterAll(() => {
        connection.dispose()
    })

    beforeEach(() => {
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
            }
        )

        parseDocument(mainDocument)
    })

    afterEach(() => {
        retriever.dispose()
    })

    it('initializes the typescript language server', async () => {
        const hoverParams: lsp.TextDocumentPositionParams = {
            textDocument: { uri: mainFileUri.toString() },
            position: { line: 29, character: 19 },
        }

        const hoverResponse = await connection.sendRequest(lsp.HoverRequest.type, hoverParams)
        expect(hoverResponse).to.have.property('contents')
    })

    it.only('resolves nested symbols on real workspace files', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: new Position(1, 25),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.map(snippet => snippet.content)).toMatchInlineSnapshot(`
          [
            "export interface LabelledValue {
              label: string;
          }
          function printLabel(labelledObj: LabelledValue): void",
          ]
        `)
    })

    // it('preloads the results when navigating to a line', async () => {
    //     await onDidChangeTextEditorSelection({
    //         textEditor: { document: testDocuments.document1 },
    //         selections: [{ active: { line: 3, character: 0 } }],
    //     })

    //     // Preloading is debounced so we need to advance the timer manually
    //     await vi.advanceTimersToNextTimerAsync()
    //     expect(getSymbolContextSnippets).toHaveBeenCalledWith({
    //         symbolsSnippetRequests: [
    //             {
    //                 uri: expect.anything(),
    //                 languageId: 'typescript',
    //                 nodeType: 'property_identifier',
    //                 symbolName: 'log',
    //                 position: new Position(2, 16),
    //             },
    //         ],
    //         recursionLimit: expect.any(Number),
    //         abortSignal: expect.anything(),
    //     })

    //     getSymbolContextSnippets.mockClear()

    //     const [snippet] = await retriever.retrieve({
    //         document: testDocuments.document1,
    //         position: new Position(3, 0),
    //         hints: { maxChars: 100, maxMs: 1000 },
    //     })

    //     expect(withPosixPaths(snippet)).toMatchObject({
    //         content: ['log(): void'],
    //         symbolName: 'log',
    //         uri: document1Uri.toString(),
    //     })
    // })

    // it('aborts the request navigating to a different line', async () => {
    //     let abortSignal: any
    //     getSymbolContextSnippets = getSymbolContextSnippets.mockImplementation(
    //         ({ abortSignal: _abortSignal }) => {
    //             abortSignal = _abortSignal
    //             return new Promise(() => {})
    //         }
    //     )

    //     await onDidChangeTextEditorSelection({
    //         textEditor: { document: testDocuments.document1 },
    //         selections: [{ active: { line: 1, character: 0 } }],
    //     })
    //     await vi.advanceTimersToNextTimerAsync()

    //     expect(getSymbolContextSnippets).toHaveBeenCalledWith({
    //         symbolsSnippetRequests: [
    //             {
    //                 uri: expect.anything(),
    //                 languageId: 'typescript',
    //                 nodeType: 'type_identifier',
    //                 symbolName: 'Test',
    //                 position: new Position(0, 13),
    //             },
    //         ],
    //         recursionLimit: expect.any(Number),
    //         abortSignal: expect.anything(),
    //     })

    //     getSymbolContextSnippets.mockClear()

    //     // Move to a different line
    //     getSymbolContextSnippets.mockImplementation(() => Promise.resolve([]))
    //     await onDidChangeTextEditorSelection({
    //         textEditor: { document: testDocuments.document1 },
    //         selections: [{ active: { line: 2, character: 0 } }],
    //     })
    //     await vi.advanceTimersToNextTimerAsync()

    //     expect(abortSignal.aborted).toBe(true)
    // })
})
