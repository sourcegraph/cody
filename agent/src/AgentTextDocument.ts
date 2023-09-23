import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { getLanguageForFileName } from './language'
import { DocumentOffsets } from './offsets'
import { TextDocument } from './protocol'
import * as vscode_shim from './vscode-shim'

// TODO: implement with vscode-languageserver-textdocument The reason we don't
// use vscode-languageserver-textdocument is because it doesn't implement all
// the properties/functions that vscode.TextDocument has. For example, lineAt is
// missing in vscode-languageserver-textdocument
export class AgentTextDocument implements vscode.TextDocument {
    constructor(public readonly textDocument: TextDocument) {
        this.content = textDocument.content ?? ''
        this.uri = URI.from({ scheme: 'file', path: textDocument.filePath })
        this.fileName = textDocument.filePath
        this.isUntitled = false
        this.languageId = getLanguageForFileName(this.fileName)
        this.offsets = new DocumentOffsets(textDocument)
        this.lineCount = this.offsets.lineCount()
    }
    private readonly content: string
    private readonly offsets: DocumentOffsets
    public readonly uri: vscode.Uri
    public readonly fileName: string
    public readonly lineCount: number
    public readonly isUntitled: boolean
    public readonly languageId: string

    public readonly version: number = 0
    public readonly isDirty: boolean = false
    public readonly isClosed: boolean = false
    public save(): Thenable<boolean> {
        throw new Error('Method not implemented.')
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
        while (firstNonWhitespaceCharacterIndex < text.length && /\s/.test(text[firstNonWhitespaceCharacterIndex])) {
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
    public offsetAt(position: vscode.Position): number {
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
    public getWordRangeAtPosition(position: vscode.Position, regex?: RegExp | undefined): vscode.Range | undefined {
        throw new Error('Method not implemented.')
    }
    public validateRange(range: vscode.Range): vscode.Range {
        throw new Error('Method not implemented.')
    }
    public validatePosition(position: vscode.Position): vscode.Position {
        throw new Error('Method not implemented.')
    }
}
