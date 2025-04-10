import type { EndOfLine, Position, Range, TextLine, TextDocument as VSCodeTextDocument } from 'vscode'
import type { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'

import { DocumentOffsets } from '@sourcegraph/cody-shared'

import { vsCodeMocks } from '../../testutils/mocks'

export function wrapVSCodeTextDocument(doc: TextDocument): VSCodeTextDocument {
    const uri = URI.parse(doc.uri)
    const offsets = new DocumentOffsets({ content: doc.getText() })

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
        // Copy-pasted implementation from AgentTextDocument.ts
        lineAt(position: Position | number): TextLine {
            const line = typeof position === 'number' ? position : position.line
            const text = this.getText(
                new vsCodeMocks.Range(
                    new vsCodeMocks.Position(line, 0),
                    new vsCodeMocks.Position(line, offsets.lineLengthExcludingNewline(line))
                )
            )
            let firstNonWhitespaceCharacterIndex = 0
            while (
                firstNonWhitespaceCharacterIndex < text.length &&
                /\s/.test(text[firstNonWhitespaceCharacterIndex])
            ) {
                firstNonWhitespaceCharacterIndex++
            }
            console.log('text', JSON.stringify(text))
            console.log('text.length', text.length)
            console.log('newLineLength', offsets.newlineLength(line))
            console.log(
                'rangeIncludingLineBreak',
                JSON.stringify(
                    new vsCodeMocks.Range(
                        new vsCodeMocks.Position(line, 0),
                        new vsCodeMocks.Position(line, text.length + offsets.newlineLength(line))
                    )
                )
            )
            console.log('-------------------')
            return {
                lineNumber: line,
                firstNonWhitespaceCharacterIndex,
                isEmptyOrWhitespace: firstNonWhitespaceCharacterIndex === text.length,
                range: new vsCodeMocks.Range(
                    new vsCodeMocks.Position(line, 0),
                    new vsCodeMocks.Position(line, text.length)
                ),
                rangeIncludingLineBreak: new vsCodeMocks.Range(
                    new vsCodeMocks.Position(line, 0),
                    new vsCodeMocks.Position(line, text.length + offsets.newlineLength(line))
                ),
                text,
            }
        },
        getWordRangeAtPosition(): Range {
            throw new Error('Method not implemented.')
        },
        validateRange(range: Range): Range {
            return new vsCodeMocks.Range(
                this.validatePosition(range.start),
                this.validatePosition(range.end)
            )
        },
        validatePosition(position: Position): Position {
            const line = Math.max(0, Math.min(position.line, this.lineCount - 1))
            const linePosition = new vsCodeMocks.Position(line, 0)
            const character = Math.max(
                0,
                Math.min(position.character, this.lineAt(linePosition).text.length)
            )

            return new vsCodeMocks.Position(line, character)
        },
    }
}

export function range(
    startLine: number,
    startCharacter: number,
    endLine?: number,
    endCharacter?: number
): Range {
    return new vsCodeMocks.Range(startLine, startCharacter, endLine || startLine, endCharacter || 0)
}

/**
 * A helper to convert paths and file URIs on objects to posix form so that test snapshots can always use
 * forward slashes and work on Windows.
 *
 * Drive letters will be removed so that `c:\foo.txt` on Windows and `/foo.txt` on POSIX will both be set
 * to `/foo.txt`.
 *
 * This function is only intended to be used to simplify expectations that compare to JSON objects and/or
 * inline snapshots (all production code executed in the test must handle Windows paths correctly).
 * @param obj the object (or array of objects) to fix paths on
 * @returns obj
 */
export function withPosixPaths<T extends object>(obj: T): T {
    if ('fileName' in obj && typeof obj.fileName === 'string') {
        obj.fileName = normalizeFilePathToPosix(obj.fileName)
    }
    if ('fileUri' in obj && URI.isUri(obj.fileUri) && obj.fileUri.scheme === 'file') {
        const normalizedPath = normalizeFilePathToPosix(obj.fileUri.fsPath)
        obj.fileUri =
            obj.fileUri instanceof vsCodeMocks.Uri
                ? vsCodeMocks.Uri.file(normalizedPath)
                : URI.file(normalizedPath)
    }
    if ('uri' in obj && URI.isUri(obj.uri) && obj.uri.scheme === 'file') {
        const normalizedPath = normalizeFilePathToPosix(obj.uri.fsPath)
        obj.uri =
            obj.uri instanceof vsCodeMocks.Uri
                ? vsCodeMocks.Uri.file(normalizedPath)
                : URI.file(normalizedPath)
    }
    if (Array.isArray(obj)) {
        for (const objItem of obj) {
            withPosixPaths(objItem)
        }
    }
    return obj
}

function normalizeFilePathToPosix(filePath: string): string {
    // Remove any drive letter.
    if (filePath[1] === ':') {
        filePath = filePath.slice(2)
    }

    // Use forward slashes.
    return filePath.replaceAll('\\', '/')
}
