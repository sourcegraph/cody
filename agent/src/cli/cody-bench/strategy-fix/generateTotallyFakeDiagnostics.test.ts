import { isFileURI } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { TscRetrieverSuite } from '../../../../../vscode/src/completions/context/retrievers/tsc/TscRetrieverSuite'
import type { ProtocolDiagnostic } from '../../../protocol-alias'
import { Buckets } from './Buckets'
import { DiagnosticCode } from './DiagnosticCode'
import { generateTotallyFakeDiagnostics } from './generateTotallyFakeDiagnostics'

describe('generateTotallyFakeDiagnostics', () => {
    const buckets = new Buckets<DiagnosticCode>(100)
    const suite = new TscRetrieverSuite()

    function typecheck(text: string): ProtocolDiagnostic[] {
        const { document } = suite.openFile(text)
        if (!isFileURI(document.uri)) {
            throw new Error('Not file URI')
        }
        return suite.retriever.diagnostics(document.uri)
    }

    it('TS2322', () => {
        const sourceFile = ts.createSourceFile(
            'test.ts',
            dedent`
        export function main(): string {
            const a = 42
            console.log(a)
            return '1'
        }
        `,
            ts.ScriptTarget.Latest,
            true
        )
        const candidate = generateTotallyFakeDiagnostics(sourceFile, buckets)
        expect(candidate.length).toBeGreaterThanOrEqual(1)
        const diagnostics = typecheck(candidate[0].newContent)
        expect(diagnostics.length).toBeGreaterThanOrEqual(1)
        expect(candidate[0].expectedDiagnosticCode).toStrictEqual(DiagnosticCode.TS2322)
        expect({
            newContent: candidate[0].newContent,
            diagnostic: diagnostics,
        }).toMatchInlineSnapshot(`
          {
            "diagnostic": "2322",
            "newContent": "export function main(): string {
              const a = 42
              console.log(a)
              return a
          }",
          }
        `)
        expect(diagnostics[0].code).toStrictEqual(DiagnosticCode.TS2322)
        expect(diagnostics[0].message).toMatchInlineSnapshot(
            `"Type 'number' is not assignable to type 'string'."`
        )
        expect(diagnostics).toMatchInlineSnapshot(`
          [
            {
              "code": "2322",
              "location": {
                "range": {
                  "end": {
                    "character": 10,
                    "line": 4,
                  },
                  "start": {
                    "character": 4,
                    "line": 4,
                  },
                },
                "uri": "file:///Users/olafurpg/dev/sourcegraph/cody/agent/example_2.ts",
              },
              "message": "Type 'number' is not assignable to type 'string'.",
              "relatedInformation": [],
              "severity": "error",
              "source": undefined,
            },
          ]
        `)
    })
})
