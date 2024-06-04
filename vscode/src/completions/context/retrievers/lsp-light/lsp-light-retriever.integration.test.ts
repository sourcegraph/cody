import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import type * as rpc from 'vscode-jsonrpc/node'

import { isWindows } from '@sourcegraph/cody-shared'

import { vsCodeMocks } from '../../../../testutils/mocks'
import { parseDocument } from '../../../../tree-sitter/parse-tree-cache'
import { documentFromFilePath, initTreeSitterParser } from '../../../test-helpers'

import { clearLspCacheForTests } from '../../../../graph/lsp/symbol-context-snippets'
import { LspLightRetriever } from './lsp-light-retriever'
import {
    initLanguageServer,
    mockLspCommands,
    openWorkspaceFiles,
    startLanguageServer,
    stopLanguageServer,
} from './lsp-test-helpers'

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

// To run these tests only with clean debug output:
// pnpm vitest vscode/src/completions/context/retrievers/lsp-light/lsp-light-retriever.integration.test.ts --disableConsoleIntercept --hideSkippedTests --reporter=basic
// TODO: fix windows tests. Probably caused by the issues files paths.
describe.skipIf(isWindows())('LspLightRetriever', () => {
    let connection: rpc.MessageConnection
    let mainFileUri: vscode.Uri
    let mainDocument: vscode.TextDocument
    let retriever: LspLightRetriever
    // TODO: test preloading of symbols
    // let onDidChangeTextEditorSelection: any

    function positionForSubstringInSnippet(snippet: string, word: string): vscode.Position {
        const text = mainDocument.getText()
        const snippetOffset = text.indexOf(snippet)
        const wordOffset = text.indexOf(word, snippetOffset)

        return mainDocument.positionAt(wordOffset)
    }

    // 1. Start the typescript-language-server
    // 2. Open typescript files in the `./test-data` directory
    // 3. In the following tests, request context for the symbols in `./test-data/main.ts`
    beforeAll(async () => {
        connection = startLanguageServer()
        await Promise.all([initLanguageServer(connection), initTreeSitterParser()])
        mockLspCommands(connection)

        const workspaceFileURIs = await openWorkspaceFiles(connection)
        mainFileUri = workspaceFileURIs.find(uri => uri.fsPath.endsWith('main.ts'))!
        mainDocument = documentFromFilePath(mainFileUri.fsPath)
        parseDocument(mainDocument)
    })

    afterAll(async () => {
        await stopLanguageServer(connection)
    })

    beforeEach(() => {
        retriever = new LspLightRetriever(
            {
                // Mock VS Code event handlers so we can fire them manually
                onDidChangeTextEditorSelection: (_onDidChangeTextEditorSelection: any) => {
                    // onDidChangeTextEditorSelection = _onDidChangeTextEditorSelection
                    return disposable
                },
            },
            {
                onDidChangeTextDocument: (_onDidChangeTextDocument: any) => {
                    return disposable
                },
            }
        )
    })

    afterEach(() => {
        // TODO: make the incremental symbol resolution work with caching. The integration test snapshots should be updated
        // after that. Currently if nested symbols are not resolved because of the recursion limit, the are never resolved.
        clearLspCacheForTests()
        retriever.dispose()
    })

    it('function with nested symbols in the argument list', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForSubstringInSnippet('import { LabelledValue, printLabel', 'printLabel'),
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
            position: positionForSubstringInSnippet(
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
            position: positionForSubstringInSnippet('import { LabelledValue', 'LabelledValue'),
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
            position: positionForSubstringInSnippet('new Greeter("world")', 'Greeter'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        // TODO: add only constructor to context snippets
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "Greeter.greeting: string
          GreeterConfig.message: string
          interface GreeterConfig {
              message: string
          }
          Greeter.greet(): string
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
            position: positionForSubstringInSnippet('new Dog("Buddy", Color.Green)', 'Dog'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        // TODO: add only constructor to context snippets
        expect(contextSnippets[0].content).toMatchInlineSnapshot(
            `
          "export interface LabelledValue {
              label: string;
          }
          Animal.name: string
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
          Color.Green = 1
          Animal.color: Color
          export enum Color { Red, Green, Blue }
          new Dog(name: string, color: Color): Dog"
        `
        )
    })

    // TODO: support multiple definition locations
    it.skip('function return value assignment with the nested symbol in the arguments', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForSubstringInSnippet(
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
            position: positionForSubstringInSnippet(
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
          export interface Square {
              color: Color
              area: number
          }
          export enum Color { Red, Green, Blue }
          createSquare(config: SquareConfig, version?: number): VersionedSquare (+1 overload)"
        `)
    })

    it('return value object literal', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForSubstringInSnippet('return { color: "blue", width: 5 }', 'return'),
            hints: { maxChars: 100, maxMs: 1000 },
        })

        expect(contextSnippets.length).toBe(1)
        expect(contextSnippets[0].content).toMatchInlineSnapshot(`
          "export interface Square {
              color: Color
              area: number
          }
          Color.Green = 1
          export enum Color { Red, Green, Blue }
          export interface SquareConfig {
              color?: Color;
              width?: number;
          }"
        `)
    })

    it('nested object field initialization', async () => {
        const contextSnippets = await retriever.retrieve({
            document: mainDocument,
            position: positionForSubstringInSnippet('items: [square, square]', 'square'),
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
            position: positionForSubstringInSnippet('background.items[0].area', 'items[0]'),
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
})
