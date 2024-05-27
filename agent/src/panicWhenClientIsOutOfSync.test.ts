import { assert, describe, it } from 'vitest'
import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import { AgentTextDocument } from './AgentTextDocument'
import { AgentTextEditor } from './AgentTextEditor'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'
import { panicWhenClientIsOutOfSync } from './panicWhenClientIsOutOfSync'
import type { ProtocolTextDocument } from './protocol-alias'

describe('panicWhenClientIsOutOfSync', () => {
    const uri = 'file:///foo/bar.txt'
    const sourceOfTruth: ProtocolTextDocument = {
        uri,
        content: 'Line 1\nLine 2\nLine 3\nLine 4\n',
        selection: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } },
        visibleRange: { start: { line: 0, character: 1 }, end: { line: 2, character: 0 } },
    }
    const doPanic = (message: string): void => assert.fail(message)

    function textDocumentDidChange(
        serverBeforeRequestDocument: ProtocolTextDocument,
        mostRecentClientDocument: ProtocolTextDocument
    ): void {
        const documents = new AgentWorkspaceDocuments({ doPanic })
        documents.loadDocumentWithChanges(
            ProtocolTextDocumentWithUri.fromDocument(serverBeforeRequestDocument)
        )
        panicWhenClientIsOutOfSync(
            documents.loadAndUpdateDocument(
                ProtocolTextDocumentWithUri.fromDocument(mostRecentClientDocument)
            ).protocolDocument.underlying,
            new AgentTextEditor(
                new AgentTextDocument(
                    ProtocolTextDocumentWithUri.fromDocument(serverBeforeRequestDocument)
                )
            ),
            { doPanic }
        )
    }

    it('equal', () => {
        textDocumentDidChange(sourceOfTruth, {
            ...sourceOfTruth,
            testing: { sourceOfTruthDocument: sourceOfTruth },
        })
    })

    it.fails('content', () => {
        textDocumentDidChange(
            {
                ...sourceOfTruth,
                content: 'Line 0\nLine 2\nLine 3\n',
            },
            {
                ...sourceOfTruth,
                testing: { sourceOfTruthDocument: sourceOfTruth },
            }
        )
    })

    // Does not crash because we don't compare contentChanges
    it('contentChanges', () => {
        textDocumentDidChange(
            {
                ...sourceOfTruth,
                contentChanges: [
                    {
                        range: { start: { line: 3, character: 3 }, end: { line: 3, character: 3 } },
                        text: 'Line 0\n',
                    },
                ],
            },
            {
                ...sourceOfTruth,
                testing: { sourceOfTruthDocument: sourceOfTruth },
            }
        )
    })

    it.fails('selection', () => {
        textDocumentDidChange(
            { ...sourceOfTruth },
            {
                ...sourceOfTruth,
                selection: { start: { line: 2, character: 2 }, end: { line: 2, character: 2 } },
                testing: { sourceOfTruthDocument: sourceOfTruth },
            }
        )
    })

    it('visibleRange', () => {
        textDocumentDidChange(
            { ...sourceOfTruth },
            {
                ...sourceOfTruth,
                visibleRange: { start: { line: 2, character: 2 }, end: { line: 2, character: 2 } },
                testing: { sourceOfTruthDocument: sourceOfTruth },
            }
        )
    })

    it('content (null)', () => {
        textDocumentDidChange(
            { ...sourceOfTruth },
            {
                ...sourceOfTruth,
                content: null as any,
                testing: { sourceOfTruthDocument: sourceOfTruth },
            }
        )
    })

    it('selection (null)', () => {
        textDocumentDidChange(
            { ...sourceOfTruth },
            {
                ...sourceOfTruth,
                selection: null as any,
                testing: { sourceOfTruthDocument: sourceOfTruth },
            }
        )
    })

    it('visibleRange (null)', () => {
        textDocumentDidChange(
            { ...sourceOfTruth },
            {
                ...sourceOfTruth,
                visibleRange: null as any,
                testing: { sourceOfTruthDocument: sourceOfTruth },
            }
        )
    })
})
