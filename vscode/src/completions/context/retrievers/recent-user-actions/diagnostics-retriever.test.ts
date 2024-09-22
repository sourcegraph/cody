import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { document } from '../../../test-helpers'
import { DiagnosticsRetriever } from './diagnostics-retriever'

describe('DiagnosticsRetriever', () => {
    let retriever: DiagnosticsRetriever

    beforeEach(() => {
        vi.useFakeTimers()
        retriever = new DiagnosticsRetriever()
    })

    afterEach(() => {
        retriever.dispose()
    })

    it('should retrieve diagnostics for a given position', async () => {
        const testDocument = document(
            `function foo() {
                console.log('foo')
            }`,
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

        const snippets = await retriever.getDiagnosticsPromptFromInformation(
            testDocument,
            new vscode.Position(1, 18),
            diagnostic
        )
        expect(snippets).toHaveLength(1)
        // const content = snippets[0].content
        // expect(content).toMatchInlineSnapshot(`
        //     "<diagnostic>
        //       <severity>error</severity>
        //       <source>ts</source>
        //       <message>Type &apos;string&apos; is not assignable to type &apos;number&apos;.</message>
        //       <text>function foo() {
        //         console.log(&apos;foo&apos;)
        //         }</text>
        //     </diagnostic>
        //     "
        // `)
    })
})
