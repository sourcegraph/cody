import type { EndOfLine, Position, Range, TextLine, TextDocument as VSCodeTextDocument } from 'vscode'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'

import { vsCodeMocks } from './mocks'

export function wrapVSCodeTextDocument(doc: TextDocument): VSCodeTextDocument {
    const uri = URI.parse(doc.uri)
    return {
        uri,
        languageId: doc.languageId,
        version: doc.version,
        lineCount: doc.lineCount,
        offsetAt: doc.offsetAt.bind(doc),
        getText: doc.getText.bind(doc),
        fileName: URI.parse(doc.uri).fsPath,
        isUntitled: false,
        isDirty: false,
        isClosed: false,
        save: () => Promise.resolve(false),
        eol: 1 satisfies EndOfLine.LF,
        positionAt(offset): Position {
            const pos = doc.positionAt(offset)
            return new vsCodeMocks.Position(pos.line, pos.character)
        },
        lineAt(position: number | Position): TextLine {
            const line = typeof position === 'number' ? position : position.line
            const lines = doc.getText().split('\n')
            const text = lines[line]
            return createTextLine(text, new vsCodeMocks.Range(line, 0, line, text.length))
        },
        getWordRangeAtPosition(): Range {
            throw new Error('Method not implemented.')
        },
        validateRange(): Range {
            throw new Error('Method not implemented.')
        },
        validatePosition(): Position {
            throw new Error('Method not implemented.')
        },
    }
}

function createTextLine(text: string, range: Range): TextLine {
    return {
        lineNumber: range.start.line,
        text,
        range,
        rangeIncludingLineBreak: range.with({ end: range.end.translate({ characterDelta: 1 }) }),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        firstNonWhitespaceCharacterIndex: text.match(/^\s*/)![0].length,
        isEmptyOrWhitespace: /^\s*$/.test(text),
    }
}

export function range(startLine: number, startCharacter: number, endLine?: number, endCharacter?: number): Range {
    return new vsCodeMocks.Range(startLine, startCharacter, endLine || startLine, endCharacter || 0)
}
