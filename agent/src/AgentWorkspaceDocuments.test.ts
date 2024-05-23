import { beforeEach, describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'

describe('AgentWorkspaceDocuments', () => {
    let documents: AgentWorkspaceDocuments
    beforeEach(() => {
        documents = new AgentWorkspaceDocuments({})
    })
    const uri = vscode.Uri.parse('file:///foo.txt')

    it('singleton document', () => {
        const document = documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, { content: 'hello' })
        )
        expect(document.getText()).toBe('hello')
        const document2 = documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, { content: 'goodbye' })
        )
        // Regardless of when you got the reference to the document, `getText()`
        // always reflects the latest value.
        expect(document.getText()).toBe('goodbye')
        expect(document2.getText()).toBe('goodbye')
    })

    it('null content', () => {
        const document = documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, { content: 'hello' })
        )
        expect(document.getText()).toBe('hello')
        expect(documents.getDocument(uri)?.getText()).toBe('hello')

        const document2 = documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, {
                contentChanges: null as any,
                content: null as any,
                visibleRange: null as any,
                selection: null as any,
            })
        )
        expect(document2.getText()).toBe('hello')
        expect(document2.protocolDocument.contentChanges).toBeUndefined()
        expect(document2.protocolDocument.selection).toBeUndefined()
        expect(document2.protocolDocument.visibleRange).toBeUndefined()
    })

    it('incremental sync', () => {
        const document = documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, { content: ['abc', 'def', 'ghi'].join('\n') })
        )
        expect(document.getText()).toBe('abc\ndef\nghi')
        documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, {
                contentChanges: [
                    {
                        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
                        text: 'x',
                    },
                    {
                        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 2 } },
                        text: 'y',
                    },
                    {
                        range: { start: { line: 2, character: 2 }, end: { line: 2, character: 3 } },
                        text: 'z',
                    },
                ],
            })
        )
        expect(document.getText()).toBe('xbc\ndyf\nghz')
    })

    it('selection', () => {
        const document = documents.loadAndUpdateDocument(ProtocolTextDocumentWithUri.from(uri, {}))
        const editor = documents.newTextEditor(document)
        expect(editor.selection).toStrictEqual(new vscode.Selection(0, 0, 0, 0))
        documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, {
                content: 'hello\ngoodbye\nworld\nsayonara\n',
                selection: { start: { line: 0, character: 0 }, end: { line: 1, character: 5 } },
            })
        )
        const expectedSelection = new vscode.Selection(0, 0, 1, 5)
        expect(editor.selection).toStrictEqual(expectedSelection)
        documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, {
                content: 'something\nis\nhappening',
                visibleRange: undefined,
            })
        )
        expect(editor.selection).toStrictEqual(expectedSelection)
        documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, {
                selection: { start: { line: 1, character: 1 }, end: { line: 2, character: 3 } },
            })
        )
        expect(editor.selection).toStrictEqual(new vscode.Selection(1, 1, 2, 3))
    })

    it('visibleRanges', () => {
        const document = documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, {
                content: 'hello\ngoodbye\nworld\nsayonara\n',
                visibleRange: { start: { line: 0, character: 0 }, end: { line: 1, character: 5 } },
            })
        )
        const editor = documents.newTextEditor(document)
        const expectedSelection = new vscode.Selection(0, 0, 1, 5)
        expect(editor.visibleRanges).toStrictEqual([expectedSelection])
        documents.loadAndUpdateDocument(
            ProtocolTextDocumentWithUri.from(uri, {
                content: 'something\nis\nhappening',
                visibleRange: undefined,
            })
        )
        expect(editor.visibleRanges).toStrictEqual([expectedSelection])
    })
})
