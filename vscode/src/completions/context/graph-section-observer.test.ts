import { afterEach, beforeEach, describe, expect, it, Mock, vi, vitest } from 'vitest'
import { URI } from 'vscode-uri'

import { HoverContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'

import { vsCodeMocks } from '../../testutils/mocks'
import { range, testFilePath } from '../../testutils/textDocument'

import { GraphSectionObserver } from './graph-section-observer'

vi.mock('vscode', () => vsCodeMocks)

const document1Uri = URI.file(testFilePath('document1.ts'))
const document2Uri = URI.file(testFilePath('document2.ts'))

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
    let getGraphContextFromRange: Mock
    let sectionObserver: GraphSectionObserver
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

        visibleTextEditors = vitest.fn().mockImplementation(() => [{ document: testDocuments.document1 }])
        getDocumentSections = vitest.fn().mockImplementation((document: typeof testDocuments.document1) => {
            const doc = Object.values(testDocuments).find(doc => doc.uri.toString() === document.uri.toString())
            return doc?.sections ?? []
        })

        getGraphContextFromRange = vitest.fn().mockImplementation(
            () =>
                [
                    {
                        symbolName: 'foo',
                        type: 'definition',
                        content: ['function foo() {}'],
                        uri: document1Uri.toString(),
                        range: { startCharacter: 0, startLine: 0, endCharacter: 0, endLine: 10 },
                    },
                    {
                        symbolName: 'bar',
                        type: 'definition',
                        content: ['function bar() {}'],
                        uri: document1Uri.toString(),
                        range: { startCharacter: 0, startLine: 11, endCharacter: 0, endLine: 20 },
                    },
                ] satisfies HoverContext[]
        )

        sectionObserver = GraphSectionObserver.createInstance(
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
            getDocumentSections,
            getGraphContextFromRange
        )
        // The section observer loads the document asynchronously, so we wait
        // for it to finish loading.
        await nextTick()
    })
    afterEach(() => {
        sectionObserver.dispose()
    })

    it('loads visible documents when it loads', () => {
        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
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

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document2Uri}
            ├─ baz
            └─ qux
          ${document1Uri}
            ├─ foo
            └─ bar"
        `)
    })

    it('does not unload documents that are no longer visible', async () => {
        visibleTextEditors.mockImplementation(() => [{ document: testDocuments.document2 }])
        await onDidChangeVisibleTextEditors()

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document2Uri}
            ├─ baz
            └─ qux
          ${document1Uri}
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

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            ├─ foo
            └─ baz"
        `)
    })

    it('loads context for sections when the cursor moves', async () => {
        const promise = onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 15, character: 0 } }],
        })

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            ├─ foo
            └─ bar (loading)

          Last visited sections:
            └ ${document1Uri} bar"
        `)

        await promise

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            ├─ foo
            └─ bar (2 snippets)

          Last visited sections:
            └ ${document1Uri} bar"
        `)
    })

    it('does not unload hydrated section when the document changes', async () => {
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })
        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            ├─ foo (2 snippets)
            └─ bar

          Last visited sections:
            └ ${document1Uri} foo"
        `)

        testDocuments.document1.lineCount = 23
        testDocuments.document1.sections = [
            { fuzzyName: 'foo', location: { uri: document1Uri, range: range(0, 0, 12, 0) } },
            { fuzzyName: 'baz', location: { uri: document1Uri, range: range(13, 0, 22, 0) } },
        ]
        await onDidChangeTextDocument({
            document: testDocuments.document1,
            contentChanges: [],
        })

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            ├─ foo (2 snippets, dirty)
            └─ baz

          Last visited sections:
            └ ${document1Uri} foo"
        `)
    })

    it('reloads sections when the document is changed', async () => {
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })
        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            ├─ foo (2 snippets)
            └─ bar

          Last visited sections:
            └ ${document1Uri} foo"
        `)

        testDocuments.document1.lineCount = 10
        testDocuments.document1.sections = [
            { fuzzyName: 'foo', location: { uri: document1Uri, range: range(0, 0, 10, 0) } },
        ]
        await onDidChangeTextDocument({
            document: testDocuments.document1,
            contentChanges: [],
        })

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            └─ foo (2 snippets, dirty)

          Last visited sections:
            └ ${document1Uri} foo"
        `)

        getGraphContextFromRange.mockImplementation(() => [
            {
                symbolName: 'foo',
                type: 'definition',
                content: ['function foo() {}'],
                filePath: document1Uri.toString(),
            },
        ])
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            └─ foo (1 snippets)

          Last visited sections:
            └ ${document1Uri} foo"
        `)
    })

    it('reloads sections when the section was significantly changed', async () => {
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })
        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            ├─ foo (2 snippets)
            └─ bar

          Last visited sections:
            └ ${document1Uri} foo"
        `)

        await onDidChangeTextDocument({
            document: testDocuments.document1,
            contentChanges: [
                {
                    range: range(1, 0, 1, 1),
                    text: 'foo\n',
                },
            ],
        })

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            ├─ foo (2 snippets, dirty)
            └─ bar

          Last visited sections:
            └ ${document1Uri} foo"
        `)

        getGraphContextFromRange.mockImplementation(() => [
            {
                symbol: 'foo',
                type: 'definition',
                content: ['function foo() {}'],
                filePath: document1Uri.toString(),
            },
        ])
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 1, character: 0 } }],
        })

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            ├─ foo (1 snippets)
            └─ bar

          Last visited sections:
            └ ${document1Uri} foo"
        `)
    })

    it('updates section ranges when the document is reloaded', async () => {
        const updatedRange = range(1, 0, 22, 0)
        // Change the document so that the bar section now starts on line 2
        testDocuments.document1.lineCount = 23
        testDocuments.document1.sections = [{ fuzzyName: 'bar', location: { document1Uri, range: range(1, 0, 22, 0) } }]
        await onDidChangeTextDocument({
            document: testDocuments.document1,
            contentChanges: [],
        })

        expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
          "${document1Uri}
            └─ bar"
        `)

        // Expect a hover to preload the updated section range
        await onDidChangeTextEditorSelection({
            textEditor: { document: testDocuments.document1 },
            selections: [{ active: { line: 2, character: 0 } }],
        })
        expect(getGraphContextFromRange).toHaveBeenCalledWith(expect.anything(), updatedRange, expect.anything())
    })

    describe('getContextAtPosition', () => {
        it('returns the cached context snippets', async () => {
            await onDidChangeTextEditorSelection({
                textEditor: { document: testDocuments.document1 },
                selections: [{ active: { line: 15, character: 0 } }],
            })

            expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
              "${document1Uri}
                ├─ foo
                └─ bar (2 snippets)

              Last visited sections:
                └ ${document1Uri} bar"
            `)

            expect(
                await sectionObserver.getContextAtPosition(
                    testDocuments.document1 as any,
                    {
                        line: 15,
                        character: 0,
                    } as any,
                    1000
                )
            ).toMatchInlineSnapshot(`
              [
                {
                  "content": "function foo() {}",
                  "fileName": ${JSON.stringify(document1Uri.fsPath)},
                  "sourceSymbolAndRelationship": undefined,
                  "symbol": "foo",
                },
                {
                  "content": "function bar() {}",
                  "fileName": ${JSON.stringify(document1Uri.fsPath)},
                  "sourceSymbolAndRelationship": undefined,
                  "symbol": "bar",
                },
              ]
            `)
        })

        it('filters out snippets that are in the prefix/suffix range', async () => {
            await onDidChangeTextEditorSelection({
                textEditor: { document: testDocuments.document1 },
                selections: [{ active: { line: 15, character: 0 } }],
            })

            expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
              "${document1Uri}
                ├─ foo
                └─ bar (2 snippets)

              Last visited sections:
                └ ${document1Uri} bar"
            `)

            expect(
                await sectionObserver.getContextAtPosition(
                    testDocuments.document1 as any,
                    {
                        line: 15,
                        character: 0,
                    } as any,
                    1000,
                    range(0, 0, 11, 0)
                )
            ).toMatchInlineSnapshot(`
              [
                {
                  "content": "function bar() {}",
                  "fileName": ${JSON.stringify(document1Uri.fsPath)},
                  "sourceSymbolAndRelationship": undefined,
                  "symbol": "bar",
                },
              ]
            `)
        })

        describe('section history', () => {
            it('includes the last visited section', async () => {
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
                expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
                  "${document1Uri}
                    ├─ foo (2 snippets)
                    └─ bar
                  ${document2Uri}
                    ├─ baz (2 snippets)
                    └─ qux

                  Last visited sections:
                    ├ ${document1Uri} foo
                    └ ${document2Uri} baz"
                `)

                const context = await sectionObserver.getContextAtPosition(
                    testDocuments.document1 as any,
                    {
                        line: 0,
                        character: 0,
                    } as any,
                    1000
                )

                expect(context[0]).toEqual({
                    content: 'foo\nbar\nfoo',
                    fileName: document2Uri.fsPath,
                })
            })

            it('does not include sections that are contained in the prefix/suffix range', async () => {
                // Visit the first and second section  in document 1
                await onDidChangeTextEditorSelection({
                    textEditor: { document: testDocuments.document1 },
                    selections: [{ active: { line: 0, character: 0 } }],
                })
                await onDidChangeTextEditorSelection({
                    textEditor: { document: testDocuments.document1 },
                    selections: [{ active: { line: 11, character: 0 } }],
                })

                expect(sectionObserver.debugPrint()).toMatchInlineSnapshot(`
                  "${document1Uri}
                    ├─ foo (2 snippets)
                    └─ bar (2 snippets)

                  Last visited sections:
                    ├ ${document1Uri} bar
                    └ ${document1Uri} foo"
                `)

                const context = await sectionObserver.getContextAtPosition(
                    testDocuments.document1 as any,
                    {
                        line: 0,
                        character: 0,
                    } as any,
                    1000,
                    range(0, 0, 20, 0)
                )

                expect(context.length).toBe(0)
            })
        })
    })
})

function nextTick() {
    return new Promise(resolve => process.nextTick(resolve))
}
