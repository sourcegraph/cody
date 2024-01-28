import type * as vscode from 'vscode'

import { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import type * as protocol from './protocol-alias'

import { getLanguageForFileName } from './language'
import { DocumentOffsets } from './offsets'
import * as vscode_shim from './vscode-shim'

// TODO: implement with vscode-languageserver-textdocument The reason we don't
// use vscode-languageserver-textdocument is because it doesn't implement all
// the properties/functions that vscode.TextDocument has. For example, lineAt is
// missing in vscode-languageserver-textdocument
// NOTE: There should only be one instance of an AgentTextDocument per uri so that
// all references have a consistent view on a document. Use AgentWorkspaceDocuments
// to get a reference to a new or existing instance.
export class AgentTextDocument implements vscode.TextDocument {
    constructor(public protocolDocument: ProtocolTextDocumentWithUri) {
        this.languageId = getLanguageForFileName(this.fileName)
        this.offsets = new DocumentOffsets(protocolDocument.underlying)
        this.lineCount = this.offsets.lineCount()
    }

    public get content(): string {
        return this.protocolDocument.underlying.content ?? ''
    }
    private offsets: DocumentOffsets
    public get uri(): vscode.Uri {
        return this.protocolDocument.uri
    }
    public get fileName(): string {
        return this.protocolDocument.uri.fsPath
    }
    public lineCount: number
    public get isUntitled(): boolean {
        return false
    }
    public languageId: string

    public version = 0
    public readonly isDirty: boolean = false
    public readonly isClosed: boolean = false
    public static from(uri: vscode.Uri, content: string): AgentTextDocument {
        return new AgentTextDocument(ProtocolTextDocumentWithUri.from(uri, { content }))
    }

    public save(): Thenable<boolean> {
        throw new Error('Method not implemented.')
    }

    // updates the content of an AgentTextDocument so that all references to this instance held throughout
    // agent see a consistent view on a text document, rather than different instances of this class per
    // document with different views.
    public update(textDocument: ProtocolTextDocumentWithUri): void {
        if (textDocument.underlying.uri !== this.protocolDocument.underlying.uri) {
            throw new Error(
                `AgentTextDocument invariant violated: ${textDocument.underlying.uri} (new URI) !== ${this.protocolDocument.underlying.uri} (this URI)`
            )
        }
        const isContentChange = textDocument.content !== this.protocolDocument.content
        this.protocolDocument = textDocument
        if (isContentChange) {
            this.offsets = new DocumentOffsets(textDocument.underlying)
            this.lineCount = this.offsets.lineCount()
        }
        this.version++
    }

    public readonly eol: vscode.EndOfLine = vscode_shim.EndOfLine.LF
    public lineAt(position: vscode.Position | number): vscode.TextLine {
        const line = typeof position === 'number' ? position : position.line
        const text = this.getText(
            new vscode_shim.Range(
                new vscode_shim.Position(line, 0),
                new vscode_shim.Position(line, this.offsets.lineLengthExcludingNewline(line))
            )
        )
        let firstNonWhitespaceCharacterIndex = 0
        while (
            firstNonWhitespaceCharacterIndex < text.length &&
            /\s/.test(text[firstNonWhitespaceCharacterIndex])
        ) {
            firstNonWhitespaceCharacterIndex++
        }
        return {
            lineNumber: line,
            firstNonWhitespaceCharacterIndex,
            isEmptyOrWhitespace: firstNonWhitespaceCharacterIndex === text.length,
            range: new vscode_shim.Range(
                new vscode_shim.Position(line, 0),
                new vscode_shim.Position(line, text.length)
            ),
            rangeIncludingLineBreak: new vscode_shim.Range(
                new vscode_shim.Position(line, 0),
                new vscode_shim.Position(line, text.length + this.offsets.newlineLength(line))
            ),
            text,
        }
    }

    public offsetAt(position: vscode.Position | protocol.Position): number {
        return this.offsets.offset(position)
    }

    public protocolOffsetAt(position: protocol.Position): number {
        return this.offsets.offset(position)
    }

    public positionAt(offset: number): vscode.Position {
        const { line, character } = this.offsets.position(offset)
        return new vscode_shim.Position(line, character)
    }

    public getText(range?: vscode.Range | undefined): string {
        if (range === undefined) {
            return this.content
        }
        const start = this.offsets.offset(range.start)
        const end = this.offsets.offset(range.end)
        const text = this.content.slice(start, end)
        return text
    }

    public getWordRangeAtPosition(
        position: vscode.Position,
        regex?: RegExp | undefined
    ): vscode.Range | undefined {
        throw new Error('Method not implemented.')
    }

    public validateRange(range: vscode.Range): vscode.Range {
        throw new Error('Method not implemented.')
    }

    public validatePosition(position: vscode.Position): vscode.Position {
        throw new Error('Method not implemented.')
    }
}
