import * as path from 'path'

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

/**
 * Builds a platform-aware absolute path for a filename.
 *
 * For POSIX platforms, returns `/file`, for windows returns
 * 'C:\file'.
 *
 * @param name The name/relative path of the file. Always in POSIX format.
 */
export function testFilePath(name: string): string {
    // `path === path.win32` does not appear to work, even though win32 says
    // "Same as parent object on windows" ☹️
    const filePath = path.sep === path.win32.sep ? `C:\\${name}` : `/${name}`

    return path.normalize(filePath)
}
