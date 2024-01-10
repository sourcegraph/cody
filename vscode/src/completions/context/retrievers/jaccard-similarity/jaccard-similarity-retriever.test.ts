import dedent from 'dedent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { DocumentContext } from '../../../get-current-doc-context'
import { document } from '../../../test-helpers'

import { JaccardSimilarityRetriever } from './jaccard-similarity-retriever'

const testDocument = document(
    dedent`
        // Write a test for TestClass

    `,
    'typescript',
    URI.file('/test-class.test.ts').toString()
)
const testDocContext: DocumentContext = {
    position: new vscode.Position(1, 0),
    multilineTrigger: null,
    multilineTriggerPosition: null,
    prefix: '// Write a test for the class TestClass\n',
    suffix: '\n',
    injectedPrefix: null,
    currentLinePrefix: '',
    currentLineSuffix: '\n',
    prevNonEmptyLine: '// Write a test for TestClass',
    nextNonEmptyLine: '',
}
const DEFAULT_HINTS = {
    maxChars: 1000,
    maxMs: 100,
}

describe('JaccardSimilarityRetriever', () => {
    const otherDocument = document(
        dedent`
            export class TestClass {
                // Method 1 of TestClass
                methodOne() {
                    console.log('one')
                }
                // Method 2 of TestClass
                methodTwo() {
                    console.log('two')
                }
            }
        `,
        'typescript',
        URI.file('/test-class.ts').toString()
    )
    const unrelatedDocument = document(
        dedent`
            I like turtles
        `,
        'typescript',
        URI.file('/unrelated.ts').toString()
    )

    beforeEach(() => {
        vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([
            { document: testDocument },
            { document: otherDocument },
            { document: unrelatedDocument },
        ] as any)
        vi.spyOn(vscode.workspace, 'openTextDocument').mockImplementation(uri => {
            if (uri && uri.toString().indexOf('unrelated') > -1) {
                return Promise.resolve(unrelatedDocument)
            } else if (uri && uri.toString().indexOf('test-class.test') > -1) {
                return Promise.resolve(testDocument)
            }
            return Promise.resolve(otherDocument)
        })
    })

    it('should retrieve relevant context snippets from other files, based on the editor prefix', async () => {
        const retriever = new JaccardSimilarityRetriever()

        const snippets = await retriever.retrieve({
            document: testDocument,
            position: testDocContext.position,
            docContext: testDocContext,
            hints: DEFAULT_HINTS,
            abortSignal: new AbortController().signal,
        })

        expect(snippets[0]).toMatchInlineSnapshot(`
          {
            "content": "export class TestClass {
              // Method 1 of TestClass
              methodOne() {
                  console.log('one')
              }
              // Method 2 of TestClass
              methodTwo() {
                  console.log('two')
              }
          }",
            "endLine": 10,
            "fileName": "/test-class.ts",
            "score": 0.10526315789473684,
            "startLine": 0,
            "uri": {
              "$mid": 1,
              "_sep": undefined,
              "external": "file:///test-class.ts",
              "fsPath": "/test-class.ts",
              "path": "/test-class.ts",
              "scheme": "file",
            },
          }
        `)
        // The unrelated file is added last with a much lower score.
        expect(snippets[1].fileName).toBe('/unrelated.ts')
        expect(snippets[1].score).toBeLessThan(0.05)
    })

    it('should pick multiple matches from the same file', async () => {
        const retriever = new JaccardSimilarityRetriever(3 /* jaccard window size */)

        const snippets = await retriever.retrieve({
            document: testDocument,
            position: testDocContext.position,
            docContext: testDocContext,
            hints: { ...DEFAULT_HINTS, maxChars: 100 },
            abortSignal: new AbortController().signal,
        })

        expect(snippets[0]).toMatchInlineSnapshot(`
          {
            "content": "export class TestClass {
              // Method 1 of TestClass
              methodOne() {",
            "endLine": 3,
            "fileName": "/test-class.ts",
            "score": 0.2222222222222222,
            "startLine": 0,
            "uri": {
              "$mid": 1,
              "_sep": undefined,
              "external": "file:///test-class.ts",
              "fsPath": "/test-class.ts",
              "path": "/test-class.ts",
              "scheme": "file",
            },
          }
        `)

        expect(snippets[1]).toMatchInlineSnapshot(`
          {
            "content": "    }
              // Method 2 of TestClass
              methodTwo() {",
            "endLine": 7,
            "fileName": "/test-class.ts",
            "score": 0.14285714285714285,
            "startLine": 4,
            "uri": {
              "$mid": 1,
              "_sep": undefined,
              "external": "file:///test-class.ts",
              "fsPath": "/test-class.ts",
              "path": "/test-class.ts",
              "scheme": "file",
            },
          }
        `)
    })

    it('should include matches from the same file that do not overlap the prefix/suffix', async () => {
        const retriever = new JaccardSimilarityRetriever(3 /* jaccard window size */)

        const testDocument = document(
            dedent`
                // Write a test for TestClass

                class TestClass {
                    // Maybe this is relevant tho?
                }
            `,
            'typescript',
            URI.file('/test-class.test.ts').toString()
        )

        vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([{ document: testDocument }] as any)
        vi.spyOn(vscode.workspace, 'openTextDocument').mockImplementation(uri => {
            return Promise.resolve(testDocument)
        })

        const testDocContext: DocumentContext = {
            position: new vscode.Position(1, 0),
            multilineTrigger: null,
            multilineTriggerPosition: null,
            prefix: '// Write a test for the class TestClass\n',
            suffix: '',
            injectedPrefix: null,
            currentLinePrefix: '',
            currentLineSuffix: '\n',
            prevNonEmptyLine: '// Write a test for TestClass',
            nextNonEmptyLine: 'class TestClass {',
        }

        const snippets = await retriever.retrieve({
            document: testDocument,
            position: testDocContext.position,
            docContext: testDocContext,
            hints: DEFAULT_HINTS,
            abortSignal: new AbortController().signal,
        })

        expect(snippets[0]).toMatchInlineSnapshot(`
          {
            "content": "class TestClass {
              // Maybe this is relevant tho?
          }",
            "endLine": 5,
            "fileName": "/test-class.test.ts",
            "score": 0.125,
            "startLine": 2,
            "uri": {
              "$mid": 1,
              "_sep": undefined,
              "external": "file:///test-class.test.ts",
              "fsPath": "/test-class.test.ts",
              "path": "/test-class.test.ts",
              "scheme": "file",
            },
          }
        `)
    })

    it('should merge multiple matches from the same file into one snippet if they overlap')
})
