import dedent from 'dedent'
import { XMLParser } from 'fast-xml-parser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { getCurrentDocContext } from '../../../get-current-doc-context'
import {
    CURSOR_MARKER,
    document,
    documentAndPosition,
    mockNotebookAndPosition,
} from '../../../test-helpers'
import { DiagnosticsRetriever } from './diagnostics-retriever'

describe('DiagnosticsRetriever', () => {
    // Helper function to create a diagnostic
    const createDiagnostic = (
        severity: vscode.DiagnosticSeverity,
        range: vscode.Range,
        message: string,
        source = 'ts',
        relatedInformation?: vscode.DiagnosticRelatedInformation[]
    ): vscode.Diagnostic => ({
        severity,
        range,
        message,
        source,
        relatedInformation,
    })

    let onDidChangeDiagnostics: (event: vscode.DiagnosticChangeEvent) => void

    describe('DiagnosticsRetrieverWithXMLRendering', () => {
        let retriever: DiagnosticsRetriever
        let parser: XMLParser

        // Helper function to reduce repetition in tests
        const testDiagnostics = async (
            testDocument: vscode.TextDocument,
            diagnostics: vscode.Diagnostic[],
            position: vscode.Position,
            expectedSnippetCount: number,
            expectedMessageSnapshot: string
        ) => {
            const snippets = await retriever.getDiagnosticsPromptFromInformation(
                testDocument,
                position,
                diagnostics
            )
            expect(snippets).toHaveLength(expectedSnippetCount)
            const message = parser.parse(snippets[0].content)
            expect(message).toBeDefined()
            expect(message.diagnostic).toBeDefined()
            expect(message.diagnostic.message).toMatchInlineSnapshot(expectedMessageSnapshot)
            return { snippets, message }
        }

        beforeEach(() => {
            vi.useFakeTimers()
            retriever = new DiagnosticsRetriever(
                {
                    contextLines: 3,
                    useXMLForPromptRendering: true,
                },
                {
                    onDidChangeDiagnostics(listener) {
                        onDidChangeDiagnostics = listener
                        return { dispose: () => {} }
                    },
                }
            )
            parser = new XMLParser()
        })

        afterEach(() => {
            retriever.dispose()
        })

        it('should handle out-of-range diagnostic lines gracefully', async () => {
            // This file has only 3 lines (indices 0, 1, and 2)
            const testDocument = document(
                dedent`
                    function smallFile() {
                        console.log('hello')
                    }
                `,
                'typescript'
            )

            // Put the diagnostic at line 999 to force an out-of-range scenario
            const diagnostics = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(999, 0, 999, 4),
                    'Out-of-range error'
                ),
            ]

            // Position is arbitrary; we just need something valid in the file
            const position = new vscode.Position(0, 0)

            await testDiagnostics(
                testDocument,
                diagnostics,
                position,
                1,
                `
        "function smallFile() {
            console.log('hello')
        }
        ^ Out-of-range error"
        `
            )
        })

        it('should retrieve diagnostics for a given position', async () => {
            const testDocument = document(
                dedent`
                function foo() {
                    console.log('foo')
                }
                `,
                'typescript'
            )
            const diagnostic = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(1, 16, 1, 21),
                    "Type 'string' is not assignable to type 'number'."
                ),
            ]
            const position = new vscode.Position(1, 16)

            await testDiagnostics(
                testDocument,
                diagnostic,
                position,
                1,
                `
                "function foo() {
                    console.log('foo')
                               ^^^^^ Type 'string' is not assignable to type 'number'.
                }"
            `
            )
        })

        it('should retrieve diagnostics on multiple lines', async () => {
            const testDocument = document(
                dedent`
                function multiLineErrors() {
                    const x: number = "string";
                    const y: string = 42;
                    const z = x + y;
                }
                `,
                'typescript'
            )
            const diagnostics = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(1, 24, 1, 32),
                    "Type 'string' is not assignable to type 'number'."
                ),
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(2, 24, 2, 26),
                    "Type 'number' is not assignable to type 'string'."
                ),
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(3, 18, 3, 23),
                    "The '+' operator cannot be applied to types 'number' and 'string'."
                ),
            ]
            const position = new vscode.Position(1, 0)

            const { snippets } = await testDiagnostics(
                testDocument,
                diagnostics,
                position,
                3,
                `
                "function multiLineErrors() {
                    const x: number = "string";
                                       ^^^^^^^ Type 'string' is not assignable to type 'number'.
                    const y: string = 42;
                    const z = x + y;
                }"
            `
            )

            expect(parser.parse(snippets[1].content).diagnostic.message).toMatchInlineSnapshot(`
                "function multiLineErrors() {
                    const x: number = "string";
                    const y: string = 42;
                                       ^ Type 'number' is not assignable to type 'string'.
                    const z = x + y;
                }"
            `)
            expect(parser.parse(snippets[2].content).diagnostic.message).toMatchInlineSnapshot(`
                "function multiLineErrors() {
                    const x: number = "string";
                    const y: string = 42;
                    const z = x + y;
                                 ^^ The '+' operator cannot be applied to types 'number' and 'string'.
                }"
            `)
        })

        it('should handle multiple diagnostics on the same line', async () => {
            const testDocument = document(
                dedent`
                function bar(x: number, y: string) {
                    return x + y;
                }
                `,
                'typescript'
            )
            const diagnostics = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(1, 11, 1, 12),
                    "The '+' operator cannot be applied to types 'number' and 'string'."
                ),
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(1, 14, 1, 15),
                    "Implicit conversion of 'string' to 'number' may cause unexpected behavior."
                ),
            ]
            const position = new vscode.Position(1, 11)

            await testDiagnostics(
                testDocument,
                diagnostics,
                position,
                1,
                `
                "function bar(x: number, y: string) {
                    return x + y;
                          ^ The '+' operator cannot be applied to types 'number' and 'string'.
                             ^ Implicit conversion of 'string' to 'number' may cause unexpected behavior.
                }"
            `
            )
        })

        it('should filter out warning diagnostics', async () => {
            const testDocument = document(
                dedent`
                function bar(x: number, y: string) {
                    return x + y;
                }
                `,
                'typescript'
            )
            const diagnostics = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(1, 11, 1, 12),
                    "The '+' operator cannot be applied to types 'number' and 'string'."
                ),
                createDiagnostic(
                    vscode.DiagnosticSeverity.Warning,
                    new vscode.Range(1, 14, 1, 15),
                    "Implicit conversion of 'string' to 'number' may cause unexpected behavior."
                ),
            ]
            const position = new vscode.Position(1, 11)

            await testDiagnostics(
                testDocument,
                diagnostics,
                position,
                1,
                `
                "function bar(x: number, y: string) {
                    return x + y;
                          ^ The '+' operator cannot be applied to types 'number' and 'string'.
                }"
            `
            )
        })

        it('should handle diagnostics at the end of the file', async () => {
            const testDocument = document(
                dedent`
                function baz() {
                    console.log('baz')
                `,
                'typescript'
            )
            const diagnostic = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(1, 21, 1, 22),
                    "'}' expected."
                ),
            ]
            const position = new vscode.Position(1, 22)

            await testDiagnostics(
                testDocument,
                diagnostic,
                position,
                1,
                `
                "function baz() {
                    console.log('baz')
                                    ^ '}' expected."
            `
            )
        })

        it('should only display context within the context lines window for a big file', async () => {
            const bigFileContent = Array(100).fill('// Some code here').join('\n')
            const testDocument = document(
                bigFileContent +
                    '\n' +
                    dedent`
                    function largeFunction() {
                        let x: number = 5;
                        let y: string = 'hello';
                        let z = x + y;
                        console.log(x);
                    }
                    `,
                'typescript'
            )
            const diagnostic = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(103, 16, 103, 21),
                    "The '+' operator cannot be applied to types 'number' and 'string'."
                ),
            ]
            const position = new vscode.Position(101, 8)

            const { message } = await testDiagnostics(
                testDocument,
                diagnostic,
                position,
                1,
                `
                "function largeFunction() {
                    let x: number = 5;
                    let y: string = 'hello';
                    let z = x + y;
                               ^^ The '+' operator cannot be applied to types 'number' and 'string'.
                    console.log(x);
                }"
            `
            )
            // Ensure that only the relevant context is shown
            expect(message.diagnostic.message).not.toContain('// Some code here')
        })

        it('should handle diagnostics with multiple related information', async () => {
            const testDocument = document(
                dedent`
                function foo(x: number) {
                    return x.toString();
                }

                let y = foo('5');
                let z = foo(true);
                `,
                'typescript'
            )
            const diagnostics = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(4, 12, 4, 15),
                    "Argument of type 'string' is not assignable to parameter of type 'number'.",
                    'ts',
                    [
                        {
                            location: new vscode.Location(
                                testDocument.uri,
                                new vscode.Range(0, 13, 0, 19)
                            ),
                            message: "The expected type comes from parameter 'x' which is declared here",
                        },
                        {
                            location: new vscode.Location(
                                testDocument.uri,
                                new vscode.Range(0, 13, 0, 19)
                            ),
                            message: "Parameter 'x' is declared as type 'number'",
                        },
                    ]
                ),
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(4, 12, 4, 16),
                    "Argument of type 'boolean' is not assignable to parameter of type 'number'.",
                    'ts',
                    [
                        {
                            location: new vscode.Location(
                                testDocument.uri,
                                new vscode.Range(0, 13, 0, 19)
                            ),
                            message: "The function 'foo' expects a number as its argument",
                        },
                    ]
                ),
            ]
            const position = new vscode.Position(4, 12)

            const { message } = await testDiagnostics(
                testDocument,
                diagnostics,
                position,
                1,
                `
                "return x.toString();
                }

                let y = foo('5');
                           ^^^ Argument of type 'string' is not assignable to parameter of type 'number'.
                           ^^^^ Argument of type 'boolean' is not assignable to parameter of type 'number'.
                let z = foo(true);"
            `
            )
            const relatedErrorList = parser.parse(message.diagnostic.related_information_list)
            expect(relatedErrorList[0].message).toContain(
                "The expected type comes from parameter 'x' which is declared here"
            )
            expect(relatedErrorList[1].message).toContain("Parameter 'x' is declared as type 'number'")
            expect(relatedErrorList[2].message).toContain(
                "The function 'foo' expects a number as its argument"
            )
        })

        it('should return snippets sorted by absolute distance from the current position', async () => {
            const testDocument = document(
                dedent`
                function foo() {
                    console.log('foo')
                }

                function bar() {
                    let x: number = 'string';
                }

                function baz() {
                    let y: boolean = 42;
                }

                function qux() {
                    let z: string = true;
                }
                `,
                'typescript'
            )
            const diagnostics = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(5, 24, 5, 32),
                    "Type 'string' is not assignable to type 'number'."
                ),
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(9, 24, 9, 26),
                    "Type 'number' is not assignable to type 'boolean'."
                ),
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(13, 24, 13, 28),
                    "Type 'boolean' is not assignable to type 'string'."
                ),
            ]
            const position = new vscode.Position(10, 0)

            const snippets = await retriever.getDiagnosticsPromptFromInformation(
                testDocument,
                position,
                diagnostics
            )
            expect(snippets).toHaveLength(3)
            const expectedStartLines: number[] = [9, 13, 5]
            for (const [index, snippet] of snippets.entries()) {
                expect(snippet.type).toBe('file')
                expect(snippet).toHaveProperty('startLine')
                expect(snippet).toHaveProperty('endLine')
                if (snippet.type === 'file') {
                    expect(snippet.startLine).toBe(expectedStartLines[index])
                }
            }
        })
    })

    describe('DiagnosticsRetrieverWithoutXMLRendering', () => {
        let retriever: DiagnosticsRetriever

        beforeEach(() => {
            retriever = new DiagnosticsRetriever(
                {
                    contextLines: 0,
                    useXMLForPromptRendering: false,
                    useCaretToIndicateErrorLocation: false,
                },
                {
                    onDidChangeDiagnostics(listener) {
                        onDidChangeDiagnostics = listener
                        return { dispose: () => {} }
                    },
                }
            )
            vi.spyOn(retriever, 'getDiagnosticsPromptFromInformation')
            vi.spyOn(vscode.languages, 'getDiagnostics')
        })

        afterEach(() => {
            retriever.dispose()
        })

        it('diagnostics change invalidates the cache', async () => {
            const { document, position } = documentAndPosition(
                dedent`
                function foo(x: number) {
                    return x.toString();
                }
                ${CURSOR_MARKER}

                let y = foo('5');
                let z = foo(true);
                `,
                'typescript'
            )
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: 100,
                maxSuffixLength: 100,
            })

            await retriever.retrieve({
                document,
                position,
                docContext,
            })
            onDidChangeDiagnostics({
                uris: [document.uri],
            })
            await retriever.retrieve({
                document,
                position,
                docContext,
            })
            expect(vscode.languages.getDiagnostics).toHaveBeenCalledTimes(2)
        })

        it('diagnostics are cached for non-notebook documents', async () => {
            const { document, position } = documentAndPosition(
                dedent`
                function foo(x: number) {
                    return x.toString();
                }
                ${CURSOR_MARKER}

                let y = foo('5');
                let z = foo(true);
                `,
                'typescript'
            )
            const docContext = getCurrentDocContext({
                document,
                position,
                maxPrefixLength: 100,
                maxSuffixLength: 100,
            })

            await retriever.retrieve({
                document,
                position,
                docContext,
            })
            await retriever.retrieve({
                document,
                position,
                docContext,
            })
            expect(vscode.languages.getDiagnostics).toHaveBeenCalledTimes(1)
        })

        it('diagnostics are cached for notebook documents as well', async () => {
            const { notebookDoc, position } = mockNotebookAndPosition({
                uri: 'file://test.ipynb',
                cells: [
                    {
                        kind: vscode.NotebookCellKind.Code,
                        text: `print("cell0 ${CURSOR_MARKER} code")`,
                        languageId: 'python',
                    },
                ],
            })

            const testDocument = notebookDoc.cellAt(0)!.document
            const docContext = getCurrentDocContext({
                document: testDocument,
                position,
                maxPrefixLength: 100,
                maxSuffixLength: 100,
            })

            vi.spyOn(vscode.window, 'activeNotebookEditor', 'get').mockReturnValue({
                notebook: notebookDoc,
            } as vscode.NotebookEditor)

            await retriever.retrieve({
                document: testDocument,
                position,
                docContext,
            })
            await retriever.retrieve({
                document: testDocument,
                position,
                docContext,
            })
            expect(vscode.languages.getDiagnostics).toHaveBeenCalledTimes(1)
        })

        it('should handle diagnostics without XML rendering', async () => {
            const testDocument = document(
                dedent`
                function foo(x: number) {
                    return x.toString();
                }

                let y = foo('5');
                let z = foo(true);
                `,
                'typescript'
            )
            const diagnostics = [
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(4, 12, 4, 15),
                    "Argument of type 'string' is not assignable to parameter of type 'number'.",
                    'ts'
                ),
                createDiagnostic(
                    vscode.DiagnosticSeverity.Error,
                    new vscode.Range(5, 12, 5, 16),
                    "Argument of type 'boolean' is not assignable to parameter of type 'number'.",
                    'ts'
                ),
            ]
            const position = new vscode.Position(4, 12)

            const snippets = await retriever.getDiagnosticsPromptFromInformation(
                testDocument,
                position,
                diagnostics
            )
            expect(snippets).toHaveLength(2)
            const message = snippets[0].content
            expect(message).toMatchInlineSnapshot(`
                "let y = foo('5');
                Err | Argument of type 'string' is not assignable to parameter of type 'number'."
            `)
        })
    })
})
