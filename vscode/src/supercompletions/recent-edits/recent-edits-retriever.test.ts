import { testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import { document } from '../../completions/test-helpers'
import { range } from '../../testutils/textDocument'
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

    const testDocument = document(dedent`
        function foo() {
            console.log('foo')
        }

        function bar() {
            console.log('bar')
        }
    `)
    function replaceFooLogWithNumber(document = testDocument) {
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
    function deleteBarLog(document = testDocument) {
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
    function addNumberLog(document = testDocument) {
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

    it('tracks document changes and creates a git diff', () => {
        replaceFooLogWithNumber()

        deleteBarLog()

        addNumberLog()

        expect(
            retriever.getDiff(testDocument.uri)!.toString().split('\n').slice(2).join('\n')
        ).toMatchInlineSnapshot(`
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

    it('does not yield changes that are older than the configured timeout', () => {
        replaceFooLogWithNumber()

        vi.advanceTimersByTime(3 * 60 * 1000)
        deleteBarLog()

        vi.advanceTimersByTime(3 * 60 * 1000)
        addNumberLog()

        expect(
            retriever.getDiff(testDocument.uri)!.toString().split('\n').slice(2).join('\n')
        ).toMatchInlineSnapshot(`
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

    it('handles renames', () => {
        replaceFooLogWithNumber()

        vi.advanceTimersByTime(3 * 60 * 1000)
        deleteBarLog()

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

        expect(
            retriever.getDiff(newUri)!.toString().split('\n').slice(2).join('\n')
        ).toMatchInlineSnapshot(`
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

    it('handles deletions', () => {
        replaceFooLogWithNumber()
        onDidDeleteFiles({ files: [testDocument.uri] })
        expect(retriever.getDiff(testDocument.uri)?.toString()).toBe(null)
    })
})
