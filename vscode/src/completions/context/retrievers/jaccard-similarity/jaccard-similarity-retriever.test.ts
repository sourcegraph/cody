import dedent from 'dedent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { getCurrentDocContext } from '../../../get-current-doc-context'
import { document, documentAndPosition } from '../../../test-helpers'

import { JaccardSimilarityRetriever } from './jaccard-similarity-retriever'

const { document: testDocument, position: testPosition } = documentAndPosition(
    dedent`
        // Write a test for the class TestClass
        █
    `,
    'typescript',
    URI.file('/test-class.test.ts').toString()
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
        // The unrelated file is added last with a much lower score.
        expect(snippets[1].fileName).toBe('/unrelated.ts')
        expect(snippets[1].score).toBeLessThan(0.05)
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

        // The first snippet contains the top of the file
        expect(snippets[0].content).toMatchInlineSnapshot(`
          "export class TestClass {
              // Method 1 of TestClass
              methodOne() {
                  console.log('one')
              }


          "
        `)
        expect(snippets[1].content).toMatchInlineSnapshot(`
          "    // Method 2 of TestClass
              methodTwo() {
                  console.log('two')
              }
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
            URI.file('/test-class.test.ts').toString()
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
        const retriever = new JaccardSimilarityRetriever(3)

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
            URI.file('test-class.ts').toString()
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
    })
})
