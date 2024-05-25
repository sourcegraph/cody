import { describe, expect, it } from 'vitest'

import { testFileUri } from '@sourcegraph/cody-shared'

import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import { AgentWorkspaceDocuments } from './AgentWorkspaceDocuments'

describe('AgentTextDocument_benchmark', () => {
    const uri = testFileUri('foo')

    it('handles a large document', () => {
        const documents = new AgentWorkspaceDocuments()
        const lineCount = 50_000
        const lineWidth = 50
        const line = 'a'.repeat(lineWidth) + '\n'
        const content = line.repeat(lineCount)
        const document = documents.loadDocument(ProtocolTextDocumentWithUri.from(uri, { content }))
        const editingLine = 5
        const updatedContent =
            line.repeat(editingLine) +
            'b'.repeat(lineWidth) +
            '\n' +
            line.repeat(lineCount - editingLine - 1)
        for (let i = 0; i < lineWidth; i++) {
            documents.loadDocument(
                ProtocolTextDocumentWithUri.from(uri, {
                    contentChanges: [
                        {
                            range: {
                                start: { line: editingLine, character: i },
                                end: { line: editingLine, character: i + 1 },
                            },
                            text: 'b',
                        },
                    ],
                })
            )
        }
        expect(document.content).toStrictEqual(updatedContent)
    })
})
