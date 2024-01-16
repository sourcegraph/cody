import { afterEach, beforeEach, describe, expect, it, vitest, type Mock } from 'vitest'
import { type URI } from 'vscode-uri'

import { testFileUri } from '@sourcegraph/cody-shared'

import { range, withPosixPathsInString } from '../../../../testutils/textDocument'
import * as docContextGetters from '../../../doc-context-getters'

import { SectionHistoryRetriever } from './section-history-retriever'

const document1Uri = testFileUri('document1.ts')
const document2Uri = testFileUri('document2.ts')

const disposable = {
    dispose: () => {},
}

interface TestDocument {
    uri: URI
    lineCount: number
    sections: { fuzzyName: string; location: any }[]
}

describe('GraphSectionObserver', () => {
    let testDocuments: {
        document1: TestDocument
        document2: TestDocument
    }

    let visibleTextEditors: Mock
    let onDidChangeVisibleTextEditors: any
    let onDidChangeTextEditorSelection: any
    let onDidChangeTextDocument: any
    let getDocumentSections: Mock
    let sectionObserver: SectionHistoryRetriever
    beforeEach(async () => {
        testDocuments = {
            document1: {
                uri: document1Uri,
                lineCount: 20,
                sections: [
                    { fuzzyName: 'foo', location: { uri: document1Uri, range: range(0, 0, 10, 0) } },
                    { fuzzyName: 'bar', location: { uri: document1Uri, range: range(11, 0, 20, 0) } },
                ],
            },
            document2: {
                uri: document2Uri,
                lineCount: 20,
                sections: [
                    { fuzzyName: 'baz', location: { uri: document2Uri, range: range(0, 0, 10, 0) } },
                    { fuzzyName: 'qux', location: { uri: document2Uri, range: range(11, 0, 20, 0) } },
                ],
            },
        }

        const getContextRangeSpy = vitest.spyOn(docContextGetters, 'getContextRange')
        getContextRangeSpy.mockImplementation(() => range(0, 0, 20, 0))

        visibleTextEditors = vitest.fn().mockImplementation(() => [{ document: testDocuments.document1 }])
        getDocumentSections = vitest.fn().mockImplementation((document: typeof testDocuments.document1) => {
            const doc = Object.values(testDocuments).find(doc => doc.uri.toString() === document.uri.toString())
            return doc?.sections ?? []
        })

        sectionObserver = SectionHistoryRetriever.createInstance(
            {
                // Mock VS Code event handlers so we can fire them manually
                onDidChangeVisibleTextEditors: (_onDidChangeVisibleTextEditors: any) => {
                    onDidChangeVisibleTextEditors = _onDidChangeVisibleTextEditors
                    return disposable
                },
                onDidChangeTextEditorSelection: (_onDidChangeTextEditorSelection: any) => {
                    onDidChangeTextEditorSelection = _onDidChangeTextEditorSelection
                    return disposable
                },
                get visibleTextEditors(): any {
                    return visibleTextEditors()
                },
            },
            {
                onDidChangeTextDocument: (_onDidChangeTextDocument: any) => {
                    onDidChangeTextDocument = _onDidChangeTextDocument
                    return disposable
                },
            },
            getDocumentSections
        )
        // The section observer loads the document asynchronously, so we wait
        // for it to finish loading.
        await nextTick()
    })
    afterEach(() => {
        sectionObserver.dispose()
    })

    it('loads visible documents when it loads', () => {
        expect(withPosixPathsInString(sectionObserver.debugPrint())).toMatchInlineSnapshot(`
          "file:/document1.ts
            ├─ foo
            └─ bar"
        `)
    })

    it('loads a new document when it becomes visible', async () => {
        visibleTextEditors.mockImplementation(() => [
            { document: testDocuments.document1 },
            { document: testDocuments.document2 },
        ])
        await onDidChangeVisibleTextEditors()

        expect(withPosixPathsInString(sectionObserver.debugPrint())).toMatchInlineSnapshot(`
          "file:/document2.ts
            ├─ baz
            └─ qux
          file:/document1.ts
            ├─ foo
            └─ bar"
        `)
    })

    it('does not unload documents that are no longer visible', async () => {
        visibleTextEditors.mockImplementation(() => [{ document: testDocuments.document2 }])
        await onDidChangeVisibleTextEditors()

        expect(withPosixPathsInString(sectionObserver.debugPrint())).toMatchInlineSnapshot(`
          "file:/document2.ts
            ├─ baz
            └─ qux
          file:/document1.ts
            ├─ foo
            └─ bar"
        `)
    })

    it('reloads the sections when two new lines are added', async () => {
        testDocuments.document1.lineCount = 23
        testDocuments.document1.sections = [
            { fuzzyName: 'foo', location: { uri: document1Uri, range: range(2, 0, 12, 0) } },
            { fuzzyName: 'baz', location: { uri: document1Uri, range: range(13, 0, 22, 0) } },
        ]
        await onDidChangeTextDocument({
            document: testDocuments.document1,
            contentChanges: [],
        })

        expect(withPosixPathsInString(sectionObserver.debugPrint())).toMatchInlineSnapshot(`
          "file:/document1.ts
            ├─ foo
            └─ baz"
        `)
    })

    it('reloads sections when the document is changed', async () => {
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })
        expect(withPosixPathsInString(sectionObserver.debugPrint())).toMatchInlineSnapshot(`
          "file:/document1.ts
            ├─ foo
            └─ bar

          Last visited sections:
            └ file:/document1.ts foo"
        `)

        testDocuments.document1.lineCount = 10
        testDocuments.document1.sections = [
            { fuzzyName: 'baz', location: { uri: document1Uri, range: range(0, 0, 10, 0) } },
        ]
        await onDidChangeTextDocument({
            document: testDocuments.document1,
            contentChanges: [],
        })

        expect(withPosixPathsInString(sectionObserver.debugPrint())).toMatchInlineSnapshot(`
          "file:/document1.ts
            └─ baz

          Last visited sections:
            └ file:/document1.ts baz"
        `)
    })

    describe('getSectionHistory', () => {
        it('returns the last visited section', async () => {
            // Open document 2
            visibleTextEditors.mockImplementation(() => [
                { document: testDocuments.document1 },
                { document: testDocuments.document2 },
            ])
            await onDidChangeVisibleTextEditors()

            // Preload the first section in document 2
            await onDidChangeTextEditorSelection({
                textEditor: { document: testDocuments.document2 },
                selections: [{ active: { line: 0, character: 0 } }],
            })

            // Preload the first section in document 1
            await onDidChangeTextEditorSelection({
                textEditor: { document: testDocuments.document1 },
                selections: [{ active: { line: 0, character: 0 } }],
            })

            // We opened and preloaded the first section of both documents and have visited them
            expect(withPosixPathsInString(sectionObserver.debugPrint())).toMatchInlineSnapshot(`
              "file:/document1.ts
                ├─ foo
                └─ bar
              file:/document2.ts
                ├─ baz
                └─ qux

              Last visited sections:
                ├ file:/document1.ts foo
                └ file:/document2.ts baz"
            `)

            const context = await sectionObserver.retrieve({
                document: testDocuments.document1 as any,
                position: {
                    line: 0,
                    character: 0,
                } as any,
                docContext: {} as any,
            })

            expect(context[0]).toEqual({
                content: 'foo\nbar\nfoo',
                fileName: document2Uri.fsPath,
                fileUri: document2Uri,
            })
        })

        it('does not include sections that are contained in the prefix/suffix range', async () => {
            // Visit the first and second section in document 1
            await onDidChangeTextEditorSelection({
                textEditor: { document: testDocuments.document1 },
                selections: [{ active: { line: 0, character: 0 } }],
            })
            await onDidChangeTextEditorSelection({
                textEditor: { document: testDocuments.document1 },
                selections: [{ active: { line: 11, character: 0 } }],
            })

            expect(withPosixPathsInString(sectionObserver.debugPrint())).toMatchInlineSnapshot(`
              "file:/document1.ts
                ├─ foo
                └─ bar

              Last visited sections:
                ├ file:/document1.ts bar
                └ file:/document1.ts foo"
            `)

            const context = await sectionObserver.retrieve({
                document: testDocuments.document1 as any,
                position: {
                    line: 0,
                    character: 0,
                } as any,
                docContext: {} as any,
            })

            expect(context.length).toBe(0)
        })
    })
})

function nextTick() {
    return new Promise(resolve => process.nextTick(resolve))
}
