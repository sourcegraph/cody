import dedent from 'dedent'
import { XMLParser } from 'fast-xml-parser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { document } from '../../../test-helpers'
import { DiagnosticsRetriever } from './diagnostics-retriever'

describe('DiagnosticsRetriever', () => {
    let retriever: DiagnosticsRetriever
    let parser: XMLParser

    beforeEach(() => {
        vi.useFakeTimers()
        retriever = new DiagnosticsRetriever()
        parser = new XMLParser()
    })

    afterEach(() => {
        retriever.dispose()
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
        const diagnostic: vscode.Diagnostic[] = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(1, 16, 1, 21),
                message: "Type 'string' is not assignable to type 'number'.",
                source: 'ts',
            },
        ]
        const position = new vscode.Position(1, 16)

        const snippets = await retriever.getDiagnosticsPromptFromInformation(
            testDocument,
            position,
            diagnostic
        )
        expect(snippets).toHaveLength(1)
        const message = parser.parse(snippets[0].content)
        expect(message).toBeDefined()
        expect(message.diagnostic).toBeDefined()
        expect(message.diagnostic.message).toMatchInlineSnapshot(`
            "function foo() {
                console.log('foo')
                           ^^^^^ Type 'string' is not assignable to type 'number'.
            }"
        `)
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
        const diagnostics: vscode.Diagnostic[] = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(1, 24, 1, 32),
                message: "Type 'string' is not assignable to type 'number'.",
                source: 'ts',
            },
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(2, 24, 2, 26),
                message: "Type 'number' is not assignable to type 'string'.",
                source: 'ts',
            },
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(3, 18, 3, 23),
                message: "The '+' operator cannot be applied to types 'number' and 'string'.",
                source: 'ts',
            },
        ]
        const position = new vscode.Position(2, 0)

        const snippets = await retriever.getDiagnosticsPromptFromInformation(
            testDocument,
            position,
            diagnostics
        )
        expect(snippets).toHaveLength(3)

        snippets.forEach((snippet, index) => {
            const message = parser.parse(snippet.content)
            expect(message).toBeDefined()
            expect(message.diagnostic).toBeDefined()
        })

        expect(parser.parse(snippets[0].content).diagnostic.message).toMatchInlineSnapshot(`
            "function multiLineErrors() {
                const x: number = "string";
                                   ^^^^^^^^ Type 'string' is not assignable to type 'number'.
                const y: string = 42;
                const z = x + y;
            }"
        `)
        expect(parser.parse(snippets[1].content).diagnostic.message).toMatchInlineSnapshot(`
            "function multiLineErrors() {
                const x: number = "string";
                const y: string = 42;
                                   ^^ Type 'number' is not assignable to type 'string'.
                const z = x + y;
            }"
        `)
        expect(parser.parse(snippets[2].content).diagnostic.message).toMatchInlineSnapshot(`
            "function multiLineErrors() {
                const x: number = "string";
                const y: string = 42;
                const z = x + y;
                             ^^^ The '+' operator cannot be applied to types 'number' and 'string'.
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
        const diagnostics: vscode.Diagnostic[] = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(1, 11, 1, 12),
                message: "The '+' operator cannot be applied to types 'number' and 'string'.",
                source: 'ts',
            },
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(1, 14, 1, 15),
                message: "Implicit conversion of 'string' to 'number' may cause unexpected behavior.",
                source: 'ts',
            },
        ]
        const position = new vscode.Position(1, 11)

        const snippets = await retriever.getDiagnosticsPromptFromInformation(
            testDocument,
            position,
            diagnostics
        )
        expect(snippets).toHaveLength(1)
        const message = parser.parse(snippets[0].content)
        expect(message).toBeDefined()
        expect(message.diagnostic).toBeDefined()
        expect(message.diagnostic.message).toMatchInlineSnapshot(`
            "function bar(x: number, y: string) {
                return x + y;
                      ^ The '+' operator cannot be applied to types 'number' and 'string'.
                         ^ Implicit conversion of 'string' to 'number' may cause unexpected behavior.
            }"
        `)
    })

    it('should filter the warning diagnostics', async () => {
        const testDocument = document(
            dedent`
            function bar(x: number, y: string) {
                return x + y;
            }
        `,
            'typescript'
        )
        const diagnostics: vscode.Diagnostic[] = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(1, 11, 1, 12),
                message: "The '+' operator cannot be applied to types 'number' and 'string'.",
                source: 'ts',
            },
            {
                severity: vscode.DiagnosticSeverity.Warning,
                range: new vscode.Range(1, 14, 1, 15),
                message: "Implicit conversion of 'string' to 'number' may cause unexpected behavior.",
                source: 'ts',
            },
        ]
        const position = new vscode.Position(1, 11)

        const snippets = await retriever.getDiagnosticsPromptFromInformation(
            testDocument,
            position,
            diagnostics
        )
        expect(snippets).toHaveLength(1)
        const message = parser.parse(snippets[0].content)
        expect(message).toBeDefined()
        expect(message.diagnostic).toBeDefined()
        expect(message.diagnostic.message).toMatchInlineSnapshot(`
            "function bar(x: number, y: string) {
                return x + y;
                      ^ The '+' operator cannot be applied to types 'number' and 'string'.
            }"
        `)
    })

    it('should handle errors at the end of the file', async () => {
        const testDocument = document(
            dedent`
            function baz() {
                console.log('baz')
        `,
            'typescript'
        )
        const diagnostic: vscode.Diagnostic[] = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(1, 22, 1, 23),
                message: "'}' expected.",
                source: 'ts',
            },
        ]
        const position = new vscode.Position(1, 23)

        const snippets = await retriever.getDiagnosticsPromptFromInformation(
            testDocument,
            position,
            diagnostic
        )
        expect(snippets).toHaveLength(1)
        const message = parser.parse(snippets[0].content)
        expect(message).toBeDefined()
        expect(message.diagnostic).toBeDefined()
        expect(message.diagnostic.message).toMatchInlineSnapshot(`
            "function baz() {
                console.log('baz')
                                 ^ '}' expected."
        `)
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
        const diagnostic: vscode.Diagnostic[] = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(103, 16, 103, 21),
                message: "The '+' operator cannot be applied to types 'number' and 'string'.",
                source: 'ts',
            },
        ]
        const position = new vscode.Position(101, 8)

        const snippets = await retriever.getDiagnosticsPromptFromInformation(
            testDocument,
            position,
            diagnostic
        )
        expect(snippets).toHaveLength(1)
        const message = parser.parse(snippets[0].content)
        expect(message).toBeDefined()
        expect(message.diagnostic).toBeDefined()
        expect(message.diagnostic.message).toMatchInlineSnapshot(`
            "function largeFunction() {
                let x: number = 5;
                let y: string = 'hello';
                let z = x + y;
                           ^^^ The '+' operator cannot be applied to types 'number' and 'string'.
                console.log(x);
            }"
        `)
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
        const diagnostics: vscode.Diagnostic[] = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(4, 12, 4, 15),
                message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
                source: 'ts',
                relatedInformation: [
                    {
                        location: new vscode.Location(testDocument.uri, new vscode.Range(0, 13, 0, 19)),
                        message: "The expected type comes from parameter 'x' which is declared here",
                    },
                    {
                        location: new vscode.Location(testDocument.uri, new vscode.Range(0, 13, 0, 19)),
                        message: "Parameter 'x' is declared as type 'number'",
                    },
                ],
            },
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(4, 12, 4, 16),
                message: "Argument of type 'boolean' is not assignable to parameter of type 'number'.",
                source: 'ts',
                relatedInformation: [
                    {
                        location: new vscode.Location(testDocument.uri, new vscode.Range(0, 13, 0, 19)),
                        message: "The function 'foo' expects a number as its argument",
                    },
                ],
            },
        ]
        const position = new vscode.Position(4, 12)

        const snippets = await retriever.getDiagnosticsPromptFromInformation(
            testDocument,
            position,
            diagnostics
        )
        expect(snippets).toHaveLength(1)
        const message = parser.parse(snippets[0].content)
        const relatedErrorList = parser.parse(message.diagnostic.related_information_list)
        expect(relatedErrorList[0].message).toContain(
            "The expected type comes from parameter 'x' which is declared here"
        )
        expect(relatedErrorList[1].message).toContain("Parameter 'x' is declared as type 'number'")
        expect(relatedErrorList[2].message).toContain(
            "The function 'foo' expects a number as its argument"
        )
    })

    it('should handle diagnostics outside of the current position context', async () => {
        const testDocument = document(
            dedent`
            function foo() {
                console.log('foo')
            }

            function bar() {
                let x: number = 'string';
            }
        `,
            'typescript'
        )
        const diagnostic: vscode.Diagnostic[] = [
            {
                severity: vscode.DiagnosticSeverity.Error,
                range: new vscode.Range(5, 24, 5, 32),
                message: "Type 'string' is not assignable to type 'number'.",
                source: 'ts',
            },
        ]
        const position = new vscode.Position(1, 0)

        const snippets = await retriever.getDiagnosticsPromptFromInformation(
            testDocument,
            position,
            diagnostic
        )
        expect(snippets).toHaveLength(0)
    })
})
