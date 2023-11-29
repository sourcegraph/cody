import * as vscode from 'vscode'

import { Range, TextDocument } from './agent-protocol'

/**
 * Wrapper around `TextDocument` that also contains a parsed vscode.Uri.
 *
 * We can't use `vscode.Uri` in `TextDocument` because we use that type in the
 * JSON-RPC protocol where URIs are string-encoded.
 */
export class TextDocumentWithUri {
    public underlying: TextDocument
    constructor(
        public readonly uri: vscode.Uri,
        underlying?: TextDocument
    ) {
        this.underlying = underlying ?? { uri: uri.toString() }
    }

    public static fromDocument(document: TextDocument): TextDocumentWithUri {
        if (document?.uri === undefined && typeof document.filePath === 'string') {
            // TODO: remove support for `document.filePath` once the migration to URIs is complete
            const uri = vscode.Uri.file(document.filePath)
            document.uri = uri.toString()
            return new TextDocumentWithUri(uri, document)
        }
        return new TextDocumentWithUri(vscode.Uri.parse(document.uri), document)
    }

    public static from(uri: vscode.Uri, document: Partial<TextDocument>): TextDocumentWithUri {
        return new TextDocumentWithUri(uri, { uri: uri.toString(), ...document })
    }

    public get content(): string | undefined {
        return this.underlying.content
    }

    public get selection(): Range | undefined {
        return this.underlying.selection
    }
}
