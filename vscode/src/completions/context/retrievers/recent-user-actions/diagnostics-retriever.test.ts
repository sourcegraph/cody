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

        const snippets = await retriever.getDiagnosticsPromptFromInformation(testDocument, diagnostic)
        expect(snippets).toHaveLength(1)
        const message = parser.parse(snippets[0].content)
        expect(message).toBeDefined()
        expect(message.diagnostic).toBeDefined()
        expect(message.diagnostic.severity).toBe('error')
        expect(message.diagnostic.source).toBe('ts')
        expect(message.diagnostic.message).toBe("Type 'string' is not assignable to type 'number'.")
        expect(message.diagnostic.text).toMatchInlineSnapshot(`
                "function foo() {
                    console.log('foo')
                               ^^^^^ Type 'string' is not assignable to type 'number'.
                }"
        `)
    })
})
