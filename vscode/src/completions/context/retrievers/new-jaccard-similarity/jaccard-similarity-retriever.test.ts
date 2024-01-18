import dedent from 'dedent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { testFileUri } from '@sourcegraph/cody-shared'

import { getCurrentDocContext } from '../../../get-current-doc-context'
import { document, documentAndPosition } from '../../../test-helpers'

import { JaccardSimilarityRetriever } from './jaccard-similarity-retriever'

const { document: testDocument, position: testPosition } = documentAndPosition(
    dedent`
        // Write a test for the class TestClass
        █
    `,
    'typescript',
    testFileUri('test-class.test.ts').toString()
)
const testDocContext = getCurrentDocContext({
    document: testDocument,
    position: testPosition,
    maxPrefixLength: 100,
    maxSuffixLength: 0,
    dynamicMultilineCompletions: false,
})

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
        testFileUri('test-class.ts').toString()
    )
    const unrelatedDocument = document(
        dedent`
            I like turtles
        `,
        'typescript',
        testFileUri('unrelated.ts').toString()
    )

    beforeEach(() => {
        vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([
            { document: testDocument },
            { document: otherDocument },
            { document: unrelatedDocument },
        ] as any)
        vi.spyOn(vscode.workspace, 'openTextDocument').mockImplementation(((uri: vscode.Uri) => {
            if (uri && uri.toString().includes('unrelated')) {
                return Promise.resolve(unrelatedDocument)
            }
            if (uri && uri.toString().includes('test-class.test')) {
                return Promise.resolve(testDocument)
            }
            return Promise.resolve(otherDocument)
        }) as any)
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

        // With the default window size, the whole test class will be included
        //
        // NOTE: We leave a big gap here of lines that does not matched our source line at all so we
        // force the algorithm to not merge the two sections.
        expect(snippets[0].content).toMatchInlineSnapshot(`
          "export class TestClass {
              // Method 1 of TestClass
              methodOne() {
                  console.log('one')
              }




              // Method 2 of TestClass
              methodTwo() {
                  console.log('two')
              }
          }"
        `)
        // The unrelated file should not be added since it does not overlap with the query at all
        expect(snippets[1]).toBeUndefined()
    })

    it('should pick multiple matches from the same file', async () => {
        // We limit the window size to 4 lines
        const retriever = new JaccardSimilarityRetriever(4)

        const snippets = await retriever.retrieve({
            document: testDocument,
            position: testDocContext.position,
            docContext: testDocContext,
            hints: { ...DEFAULT_HINTS, maxChars: 100 },
            abortSignal: new AbortController().signal,
        })

        expect(snippets).toHaveLength(2)
        // The first snippet contains the top of the file...
        expect(snippets[0].content).toMatchInlineSnapshot(`
          "export class TestClass {
              // Method 1 of TestClass
              methodOne() {
                  console.log('one')"
        `)
        // ...the second one contains the bottom.
        expect(snippets[1].content).toMatchInlineSnapshot(`
          "    // Method 2 of TestClass
              methodTwo() {
                  console.log('two')
              }"
        `)
    })

    it('should include matches from the same file that do not overlap the prefix/suffix', async () => {
        // We limit the window size to 3 lines
        const retriever = new JaccardSimilarityRetriever(3)

        const { document: testDocument, position: testPosition } = documentAndPosition(
            dedent`
                // Write a test for TestClass
                █



                class TestClass {
                    // Maybe this is relevant tho?
                }
            `,
            'typescript',
            testFileUri('test-class.test.ts').toString()
        )

        vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([{ document: testDocument }] as any)
        vi.spyOn(vscode.workspace, 'openTextDocument').mockImplementation(uri => {
            return Promise.resolve(testDocument)
        })

        const testDocContext = getCurrentDocContext({
            document: testDocument,
            position: testPosition,
            maxPrefixLength: 100,
            maxSuffixLength: 0,
            dynamicMultilineCompletions: false,
        })

        const snippets = await retriever.retrieve({
            document: testDocument,
            position: testDocContext.position,
            docContext: testDocContext,
            hints: DEFAULT_HINTS,
            abortSignal: new AbortController().signal,
        })

        expect(snippets[0].content).toMatchInlineSnapshot(`
          "class TestClass {
              // Maybe this is relevant tho?
          }"
        `)
    })

    it('should merge multiple matches from the same file into one snippet if they overlap', async () => {
        // We limit the window size to 3 lines
        const retriever = new JaccardSimilarityRetriever(4)

        // NOTE: This document has no space between the top relevant section, so we expect it to be
        // merged into one.
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
            testFileUri('test-class.ts').toString()
        )

        vi.spyOn(vscode.window, 'visibleTextEditors', 'get').mockReturnValue([{ document: otherDocument }] as any)
        vi.spyOn(vscode.workspace, 'openTextDocument').mockImplementation(uri => {
            return Promise.resolve(otherDocument)
        })

        const snippets = await retriever.retrieve({
            document: testDocument,
            position: testDocContext.position,
            docContext: testDocContext,
            hints: DEFAULT_HINTS,
            abortSignal: new AbortController().signal,
        })

        expect(snippets).toHaveLength(1)
        expect(snippets[0].content).toMatchInlineSnapshot(`
          "export class TestClass {
              // Method 1 of TestClass
              methodOne() {
                  console.log('one')
              }
              // Method 2 of TestClass
              methodTwo() {
                  console.log('two')"
        `)
    })
})
