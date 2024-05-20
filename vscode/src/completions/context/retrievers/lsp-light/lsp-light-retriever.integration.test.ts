import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import type * as rpc from 'vscode-jsonrpc/node'
import * as lsp from 'vscode-languageserver-protocol/node'

import { Uri, vsCodeMocks } from '../../../../testutils/mocks'
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

    function positionForWordInSnippet(snippet: string, word: string): vscode.Position {
        const text = mainDocument.getText()
        const snippetOffset = text.indexOf(snippet)
        const wordOffset = text.indexOf(word, snippetOffset)

        return mainDocument.positionAt(wordOffset)
    }

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

    it('function with nested symbols in the argument list', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet('import { LabelledValue, printLabel', 'printLabel'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "export interface LabelledValue {
              label: string;
          }
          function printLabel(labelledObj: LabelledValue): void"
        `)
    })

    it('function with nested symbols in the argument list and the return value', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet(
                'import { LabelledValue, printLabel, printLabelAndSquare }',
                'printLabelAndSquare'
            ),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "export interface SquareConfig {
              color?: Color;
              width?: number;
          }
          export interface Square {
              color: Color
              area: number
          }
          export enum Color { Red, Green, Blue }
          function printLabelAndSquare(labelledObj: LabelledValue): SquareConfig"
        `)
    })

    it('interface', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet('import { LabelledValue', 'LabelledValue'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "export interface LabelledValue {
              label: string;
          }"
        `)
    })

    it('class constructor with an interface in arguments', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet('new Greeter("world")', 'Greeter'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        // TODO: add only constructor to context snippets
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "interface GreeterConfig {
              message: string
          }
          Greeter.greeting: string
          GreeterConfig.message: string
          export class Greeter {
              greeting: string;

              constructor(config: GreeterConfig ) {
                  this.greeting = config.message;
              }

              greet() {
                  return "Hello, " + this.greeting;
              }
          }"
        `)
    })

    it('class constructor with an enum in arguments', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet('new Dog("Buddy", Color.Green)', 'Dog'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        // TODO: add only constructor to context snippets
        expect(contextSnippets[0].content).toMatchInlineSnapshot(
            `
          "export interface LabelledValue {
              label: string;
          }
          export enum Color { Red, Green, Blue }
          Color.Green = 1
          export class Animal {
              name: string;
              color: Color;

              constructor(name: string, color: Color) {
                  this.name = name;
                  this.color = color;
              }

              move(distanceInMeters: number = 0) {
                  console.log(\`\${this.name} moved \${distanceInMeters}m. Color: \${Color[this.color]}\`);
              }
          }
          Animal.color: Color
          Animal.name: string
          new Dog(name: string, color: Color): Dog"
        `
        )
    })

    // TODO: support multiple definition locations
    it.skip('function return value assignment with the nested symbol in the arguments', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet(
                'import { Background, SquareConfig, createSquare }',
                'createSquare'
            ),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "export interface VersionedSquare extends Square {
              version: number
          }
          export interface Square {
              color: Color
              area: number
          }
          export enum Color { Red, Green, Blue }
          createSquare(config: SquareConfig, version?: number): VersionedSquare"
        `)
    })

    it('function return value assignment with the nested symbol in the arguments', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet(
                'let square = createSquare(squareConfig)',
                'createSquare'
            ),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "export interface SquareConfig {
              color?: Color;
              width?: number;
          }
          export enum Color { Red, Green, Blue }
          export interface Square {
              color: Color
              area: number
          }
          createSquare(config: SquareConfig, version?: number): VersionedSquare (+1 overload)"
        `)
    })

    it('return value object literal', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet('return { color: "blue", width: 5 }', 'return'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "export enum Color { Red, Green, Blue }
          export interface Square {
              color: Color
              area: number
          }
          Color.Green = 1
          export interface SquareConfig {
              color?: Color;
              width?: number;
          }"
        `)
    })

    it('nested object field initialization', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet('items: [square, square]', 'square'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "export interface Square {
              color: Color
              area: number
          }
          export enum Color { Red, Green, Blue }
          Background.items: Square[]"
        `)
    })

    it('nested object field getter', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForWordInSnippet('background.items[0].area', 'items[0]'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "export interface Square {
              color: Color
              area: number
          }
          export enum Color { Red, Green, Blue }
          Background.items: Square[]"
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
