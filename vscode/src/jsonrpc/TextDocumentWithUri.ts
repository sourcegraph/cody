import * as vscode from 'vscode'

import { logDebug } from '../log'
import type { ProtocolTextDocument, Range } from './agent-protocol'

/**
 * Wrapper around `ProtocolTextDocument` that also contains a parsed vscode.Uri.
 *
 * We can't use `vscode.Uri` in `ProtocolTextDocument` because we use that type
 * in the JSON-RPC protocol where URIs are string-encoded.
 */
export class ProtocolTextDocumentWithUri {
    public underlying: ProtocolTextDocument
    private constructor(
        public readonly uri: vscode.Uri,
        underlying?: ProtocolTextDocument
    ) {
        this.underlying = underlying ?? { uri: uri.toString() }
        if (this.underlying.uri !== uri.toString()) {
            logDebug(
                'ProtocolTextDocumentWithUri',
                'correcting invariant violation',
                `${this.uri} (this.uri) !== ${this.underlying.uri} (this.underlying.uri)`
            )
            this.underlying.uri = uri.toString()
        }
    }

    public static fromDocument(document: ProtocolTextDocument): ProtocolTextDocumentWithUri {
        if (document?.uri === undefined && typeof document.filePath === 'string') {
            // TODO: remove support for `document.filePath` once the migration to URIs is complete
            const uri = vscode.Uri.file(document.filePath)
            document.uri = uri.toString()
            return new ProtocolTextDocumentWithUri(uri, document)
        }
        return new ProtocolTextDocumentWithUri(vscode.Uri.parse(document.uri), document)
    }

    public static from(
        uri: vscode.Uri,
        document?: Partial<ProtocolTextDocument>
    ): ProtocolTextDocumentWithUri {
        return new ProtocolTextDocumentWithUri(uri, { ...document, uri: uri.toString() })
    }

    public get content(): string | undefined {
        return this.underlying.content
    }

    public get selection(): Range | undefined {
        return this.underlying.selection
    }
}
