import { describe, expect, it } from 'vitest'
import { ProtocolTextDocumentWithUri } from './TextDocumentWithUri'

describe('TextDocumentWithUri', () => {
    it('handles URIs with exclamation marks', () => {
        const uri =
            'file:///Users/com.jetbrains/ideaIC-2022.1-sources.jar!/com/intellij/RequiresBackgroundThread.java'
        const textDocument = ProtocolTextDocumentWithUri.fromDocument({ uri })
        expect(textDocument.uri.toString()).toStrictEqual(textDocument.underlying.uri)
        expect(textDocument.uri.toString()).toStrictEqual(
            'file:///Users/com.jetbrains/ideaIC-2022.1-sources.jar%21/com/intellij/RequiresBackgroundThread.java'
        )
    })
})
