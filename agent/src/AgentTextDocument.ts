import type * as vscode from 'vscode'

import type { ProtocolTextDocumentWithUri } from '../../vscode/src/jsonrpc/TextDocumentWithUri'
import type * as protocol from './protocol-alias'

import { type ChangeSpec, EditorState, type Line, type TransactionSpec } from '@codemirror/state'
import { calculateContentChanges } from './calculateContentChanges'
import { getLanguageForFileName } from './language'
import * as vscode_shim from './vscode-shim'
import { vscodeRange } from './vscode-type-converters'

// NOTE: There should only be one instance of an AgentTextDocument per uri so
// that all references have a consistent view on a document. Use
// AgentWorkspaceDocuments to get a reference to a new or existing instance.
//
// Internally, this class is implemented with CodeMirror to support
// high-performance incremental updates to large documents. A naive
// implementation based on `.split()` and `.indexOf()` quickly starts to
// struggle if the user opens a very large document and start typing.
export class AgentTextDocument implements vscode.TextDocument {
    public _state: EditorState
    public fileName: string
    public uriString: string
    public visibleRanges: vscode.Range[] = []
    public visibleRange: vscode.Range | undefined
    constructor(
        public uri: vscode.Uri,
        protocolDocument: Omit<protocol.ProtocolTextDocument, 'uri'>
    ) {
        this.uriString = uri.toString()
        this._state = EditorState.create({ doc: protocolDocument.content ?? '' })
        this.fileName = uri.fsPath
        this.languageId = getLanguageForFileName(this.fileName)
        if (protocolDocument.selection) {
            this.state = this.state.update({
                selection: {
                    head: this.offsetAt(protocolDocument.selection.start),
                    anchor: this.offsetAt(protocolDocument.selection.end),
                },
            }).state
        }
        this.visibleRange = protocolDocument.visibleRange
            ? vscodeRange(protocolDocument.visibleRange)
            : undefined
    }

    private get state() {
        return this._state
    }
    private set state(newState: EditorState) {
        this._state = newState
        this._content = undefined
    }

    _content: string | undefined
    public get content(): string {
        // NOTE(olafurpg): codemirror doesn't cache the result of `Text.toString()`.
        // For large documents, this function can become expensive so we cache it here.
        if (this._content === undefined) {
            this._content = this.state.doc.toString()
        }
        return this._content
    }
    public get lineCount(): number {
        return this.state.doc.lines - 1 // CodeMirror lines are 1-based!
    }
    public get isUntitled(): boolean {
        return false
    }
    public languageId: string

    public version = 0
    public readonly isDirty: boolean = false
    public readonly isClosed: boolean = false
    public static fromProtocol(document: ProtocolTextDocumentWithUri): AgentTextDocument {
        return new AgentTextDocument(document.uri, document.underlying)
    }
    public static from(uri: vscode.Uri, content: string): AgentTextDocument {
        return new AgentTextDocument(uri, { content })
    }

    public save(): Thenable<boolean> {
        throw new Error('Method not implemented.')
    }

    public updateFromClientDocument(
        textDocument: ProtocolTextDocumentWithUri
    ): vscode.TextDocumentContentChangeEvent[] {
        const vscChanges: vscode.TextDocumentContentChangeEvent[] = []
        if (this.uriString !== textDocument.underlying.uri) {
            throw new Error(
                `AgentTextDocument invariant violated: ${textDocument.underlying.uri} (new URI) !== ${this.uriString} (this URI)`
            )
        }
        const cmTransactions: TransactionSpec[] = []
        if (textDocument.contentChanges !== undefined) {
            const cmChanges: ChangeSpec[] = []
            for (const change of textDocument.contentChanges) {
                const from = this.offsetAt(change.range.start)
                const to = this.offsetAt(change.range.end)
                vscChanges.push({
                    range: vscodeRange(change.range),
                    rangeOffset: from,
                    rangeLength: change.text.length,
                    text: change.text,
                })
                cmChanges.push({
                    from,
                    to,
                    insert: change.text,
                })
            }
            cmTransactions.push({ changes: cmChanges })
        } else if (textDocument.content !== undefined) {
            // Full document sync.
            for (const change of calculateContentChanges(this, this.content)) {
                vscChanges.push(change)
            }
            cmTransactions.push({
                changes: { from: 0, to: this.state.doc.length, insert: textDocument.content },
            })
        }

        if (textDocument.selection !== undefined) {
            cmTransactions.push({
                selection: {
                    anchor: textDocument.selection.start.line,
                    head: textDocument.selection.end.line,
                },
            })
        }

        if (textDocument.visibleRange) {
            this.visibleRange = vscodeRange(textDocument.visibleRange)
        }

        this.state = this.state.update(...cmTransactions).state

        this.version++
        return vscChanges
    }

    public readonly eol: vscode.EndOfLine = vscode_shim.EndOfLine.LF
    public lineAt(position: vscode.Position | number): vscode.TextLine {
        const lineNumber = typeof position === 'number' ? position : position.line
        const line = lineNumber < this.lineCount ? this.cmLine(lineNumber) : undefined
        const text = line?.text ?? ''
        let firstNonWhitespaceCharacterIndex = 0
        while (
            firstNonWhitespaceCharacterIndex < text.length &&
            /\s/.test(text[firstNonWhitespaceCharacterIndex])
        ) {
            firstNonWhitespaceCharacterIndex++
        }

        return {
            lineNumber,
            firstNonWhitespaceCharacterIndex,
            isEmptyOrWhitespace: firstNonWhitespaceCharacterIndex === text.length,
            range: line ? this.rangeAt(line.from, line.to) : new vscode_shim.Range(0, 0, 0, 0),
            rangeIncludingLineBreak: line // TODO: fixme
                ? this.rangeAt(line.from, line.to + 1 /* assuming \n newline */)
                : new vscode_shim.Range(0, 0, 0, 0),
            text,
        }
    }

    public offsetAt(position: vscode.Position | protocol.Position): number {
        return this.cmLine(position.line).from + position.character
    }

    private cmLine(line: number): Line {
        // CodeMirror `Line.number` is 1-based!
        return this.state.doc.line(line + 1)
    }

    public rangeAt(from: number, to: number): vscode.Range {
        return new vscode_shim.Range(this.positionAt(from), this.positionAt(to))
    }
    public positionAt(offset: number): vscode.Position {
        const line = this.state.doc.lineAt(offset)
        const character = offset - line.from
        return new vscode_shim.Position(line.number - 1, character)
    }

    public getText(range?: vscode.Range | undefined): string {
        if (range === undefined) {
            return this.content
        }
        const start = this.offsetAt(range.start)
        const end = this.offsetAt(range.end)
        return this.state.doc.sliceString(start, end)
    }

    public getWordRangeAtPosition(
        position: vscode.Position,
        regex?: RegExp | undefined
    ): vscode.Range | undefined {
        // TODO: this is easy to implement with CodeMirror
        throw new Error('Method not implemented.')
    }

    public validateRange(range: vscode.Range): vscode.Range {
        // TODO: this is easy to implement with CodeMirror
        throw new Error('Method not implemented.')
    }

    public validatePosition(position: vscode.Position): vscode.Position {
        // TODO: this is easy to implement with CodeMirror
        throw new Error('Method not implemented.')
    }
}
