import { contextFiltersProvider, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import { range } from '../../../../testutils/textDocument'
import { document } from '../../../test-helpers'
import { RecentEditsRetriever } from './recent-edits-retriever'

const FIVE_MINUTES = 5 * 60 * 1000

describe('RecentEditsRetriever', () => {
    let retriever: RecentEditsRetriever

    // Mock workspace APIs to trigger document changes
    let onDidChangeTextDocument: (event: vscode.TextDocumentChangeEvent) => void
    let onDidRenameFiles: (event: vscode.FileRenameEvent) => void
    let onDidDeleteFiles: (event: vscode.FileDeleteEvent) => void
    beforeEach(() => {
        vi.useFakeTimers()
        vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)

        retriever = new RecentEditsRetriever(FIVE_MINUTES, {
            onDidChangeTextDocument(listener) {
                onDidChangeTextDocument = listener
                return { dispose: () => {} }
            },
            onDidRenameFiles(listener) {
                onDidRenameFiles = listener
                return { dispose: () => {} }
            },
            onDidDeleteFiles(listener) {
                onDidDeleteFiles = listener
                return { dispose: () => {} }
            },
        })
    })
    afterEach(() => {
        retriever.dispose()
    })

    function replaceFooLogWithNumber(document: vscode.TextDocument) {
        onDidChangeTextDocument({
            document,
            contentChanges: [
                {
                    range: range(1, 16, 1, 21),
                    text: '1337',
                    rangeLength: 5,
                    rangeOffset: 33,
                },
            ],
            reason: undefined,
        })
    }
    function deleteBarLog(document: vscode.TextDocument) {
        onDidChangeTextDocument({
            document,
            contentChanges: [
                {
                    range: range(5, 0, 5, 23),
                    text: '',
                    rangeLength: 23,
                    rangeOffset: 59,
                },
            ],
            reason: undefined,
        })
    }
    function addNumberLog(document: vscode.TextDocument) {
        onDidChangeTextDocument({
            document,
            contentChanges: [
                {
                    range: range(5, 0, 5, 0),
                    text: '    console.log(1338)\n',
                    rangeLength: 0,
                    rangeOffset: 59,
                },
            ],
            reason: undefined,
        })
    }

    describe('SingleDocumentDiff', () => {
        const testDocument = document(dedent`
            function foo() {
                console.log('foo')
            }

            function bar() {
                console.log('bar')
            }
        `)

        it('tracks document changes and creates a git diff', async () => {
            replaceFooLogWithNumber(testDocument)

            deleteBarLog(testDocument)

            addNumberLog(testDocument)

            const diff = await retriever.getDiff(testDocument.uri)
            expect(diff!.toString().split('\n').slice(2).join('\n')).toMatchInlineSnapshot(`
              "@@ -1,7 +1,7 @@
               function foo() {
              -    console.log('foo')
              +    console.log(1337)
               }

               function bar() {
              -    console.log('bar')
              +    console.log(1338)
               }
              \\ No newline at end of file
              "
            `)
        })

        it('no-ops for blocked files due to the context filter', async () => {
            vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValueOnce('repo:foo')

            replaceFooLogWithNumber(testDocument)

            deleteBarLog(testDocument)

            addNumberLog(testDocument)

            expect(await retriever.getDiff(testDocument.uri)).toBe(null)
        })

        it('does not yield changes that are older than the configured timeout', async () => {
            replaceFooLogWithNumber(testDocument)

            vi.advanceTimersByTime(3 * 60 * 1000)
            deleteBarLog(testDocument)

            vi.advanceTimersByTime(3 * 60 * 1000)
            addNumberLog(testDocument)

            const diff = await retriever.getDiff(testDocument.uri)
            expect(diff!.toString().split('\n').slice(2).join('\n')).toMatchInlineSnapshot(`
              "@@ -2,6 +2,6 @@
                   console.log(1337)
               }

               function bar() {
              -    console.log('bar')
              +    console.log(1338)
               }
              \\ No newline at end of file
              "
            `)
        })

        it('handles renames', async () => {
            replaceFooLogWithNumber(testDocument)

            vi.advanceTimersByTime(3 * 60 * 1000)
            deleteBarLog(testDocument)

            const newUri = testFileUri('test2.ts')
            onDidRenameFiles({
                files: [
                    {
                        oldUri: testDocument.uri,
                        newUri,
                    },
                ],
            })
            const renamedDoc = { ...testDocument, uri: newUri }

            vi.advanceTimersByTime(3 * 60 * 1000)
            addNumberLog(renamedDoc)

            const diff = await retriever.getDiff(newUri)
            expect(diff!.toString().split('\n').slice(2).join('\n')).toMatchInlineSnapshot(`
              "@@ -2,6 +2,6 @@
                   console.log(1337)
               }

               function bar() {
              -    console.log('bar')
              +    console.log(1338)
               }
              \\ No newline at end of file
              "
            `)
        })

        it('handles deletions', async () => {
            replaceFooLogWithNumber(testDocument)
            onDidDeleteFiles({ files: [testDocument.uri] })
            expect(await retriever.getDiff(testDocument.uri)).toBe(null)
        })
    })

    describe('MultiDocumentDiff', () => {
        it('Changes across multiple files are returned', async () => {
            const nDocuments = 10
            for (let i = 0; i < nDocuments; i++) {
                const currentDoc = document(
                    dedent`
                    function foo() {
                        console.log('foo')
                    }

                    function bar() {
                        console.log('bar')
                    }
                `,
                    'typescript',
                    `document-${i}.ts`
                )
                replaceFooLogWithNumber(currentDoc)
                deleteBarLog(currentDoc)
                addNumberLog(currentDoc)
            }
            const diffAcrossDocuments = await retriever.getDiffAcrossDocuments()
            for (const [index, documentDiff] of diffAcrossDocuments.entries()) {
                const diff = documentDiff.diff
                expect(diff!.toString().split('\n').slice(2).join('\n')).toMatchInlineSnapshot(`
                    "@@ -1,7 +1,7 @@
                    function foo() {
                    -    console.log('foo')
                    +    console.log(1337)
                    }

                    function bar() {
                    -    console.log('bar')
                    +    console.log(1338)
                    }
                    \\ No newline at end of file
                    "
                `)
                expect(documentDiff.uri.path).toBe(`/document-${index}.ts`)
            }
        })
    })
})
