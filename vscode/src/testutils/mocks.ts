/* eslint-disable @typescript-eslint/no-empty-function */
// TODO: use implements vscode.XXX on mocked classes to ensure they match the real vscode API.
import type { Position as VSCodePosition, Range as VSCodeRange } from 'vscode'

/**
 * This module defines shared VSCode mocks for use in every Vitest test.
 * Tests requiring no custom mocks will automatically apply the mocks defined in this file.
 * This is made possible via the `setupFiles` property in the Vitest configuration.
 */

class Position implements VSCodePosition {
    public line: number
    public character: number

    constructor(line: number, character: number) {
        this.line = line
        this.character = character
    }

    public isAfter(other: Position): boolean {
        return other.line < this.line || (other.line === this.line && other.character < this.character)
    }
    public isAfterOrEqual(other: Position): boolean {
        return this.isAfter(other) || this.isEqual(other)
    }
    public isBefore(other: Position): boolean {
        return !this.isAfterOrEqual(other)
    }
    public isBeforeOrEqual(other: Position): boolean {
        return !this.isAfter(other)
    }
    public isEqual(other: Position): boolean {
        return this.line === other.line && this.character === other.character
    }
    public translate(change: { lineDelta?: number; characterDelta?: number }): VSCodePosition
    public translate(lineDelta?: number, characterDelta?: number): VSCodePosition
    public translate(
        arg?: number | { lineDelta?: number; characterDelta?: number },
        characterDelta?: number
    ): VSCodePosition {
        const lineDelta = typeof arg === 'number' ? arg : arg?.lineDelta
        characterDelta = arg && typeof arg !== 'number' ? arg.characterDelta : characterDelta
        return new Position(this.line + (lineDelta || 0), this.character + (characterDelta || 0))
    }

    public with(line?: number, character?: number): VSCodePosition
    public with(change: { line?: number; character?: number }): VSCodePosition
    public with(arg?: number | { line?: number; character?: number }, character?: number): VSCodePosition {
        const line = typeof arg === 'number' ? arg : arg?.line
        character = arg && typeof arg !== 'number' ? arg.character : character
        return new Position(this.line + (line || 0), this.character + (character || 0))
    }

    public compareTo(other: VSCodePosition): number {
        return this.isBefore(other) ? -1 : this.isAfter(other) ? 1 : 0
    }
}

class Range implements VSCodeRange {
    public start: Position
    public end: Position

    constructor(
        startLine: number | Position,
        startCharacter: number | Position,
        endLine?: number,
        endCharacter?: number
    ) {
        if (typeof startLine !== 'number' && typeof startCharacter !== 'number') {
            this.start = startLine
            this.end = startCharacter
        } else if (
            typeof startLine === 'number' &&
            typeof startCharacter === 'number' &&
            typeof endLine === 'number' &&
            typeof endCharacter === 'number'
        ) {
            this.start = new Position(startLine, startCharacter)
            this.end = new Position(endLine, endCharacter)
        } else {
            throw new TypeError('this version of the constructor is not implemented')
        }
    }

    public with(start?: VSCodePosition, end?: VSCodePosition): VSCodeRange
    public with(change: { start?: VSCodePosition; end?: VSCodePosition }): VSCodeRange
    public with(
        arg?: VSCodePosition | { start?: VSCodePosition; end?: VSCodePosition },
        end?: VSCodePosition
    ): VSCodeRange {
        const start = arg && ('start' in arg || 'end' in arg) ? arg.start : (arg as VSCodePosition)
        end = arg && 'end' in arg ? arg.end : end
        return new Range(start || this.start, end || this.end)
    }
    public get startLine(): number {
        return this.start.line
    }
    public get startCharacter(): number {
        return this.start.character
    }
    public get endLine(): number {
        return this.end.line
    }
    public get endCharacter(): number {
        return this.end.character
    }
    public isEqual(other: VSCodeRange): boolean {
        return this.start.isEqual(other.start) && this.end.isEqual(other.end)
    }
    public get isEmpty(): boolean {
        return this.start.isEqual(this.end)
    }
    public get isSingleLine(): boolean {
        return this.start.line === this.end.line
    }
    public contains(): boolean {
        throw new Error('not implemented')
    }
    public intersection(): VSCodeRange | undefined {
        throw new Error('not implemented')
    }
    public union(): VSCodeRange {
        throw new Error('not implemented')
    }
}

class Uri {
    public fsPath: string
    public path: string
    constructor(path: string) {
        this.fsPath = path
        this.path = path
    }
}

class InlineCompletionItem {
    public insertText: string
    public range: Range | undefined
    constructor(content: string, range?: Range) {
        this.insertText = content
        this.range = range
    }
}

// TODO(abeatrix): Implement delete and insert mocks
class WorkspaceEdit {
    public delete(uri: Uri, range: Range): Range {
        return range
    }
    public insert(uri: Uri, position: Position, content: string): string {
        return content
    }
}

class EventEmitter {
    public on: () => undefined

    constructor() {
        this.on = () => undefined
    }
}

enum EndOfLine {
    /**
     * The line feed `\n` character.
     */
    LF = 1,
    /**
     * The carriage return line feed `\r\n` sequence.
     */
    CRLF = 2,
}

class CancellationTokenSource {
    public token: unknown

    constructor() {
        this.token = {
            onCancellationRequested() {},
        }
    }
}

export const vsCodeMocks = {
    Range,
    Position,
    InlineCompletionItem,
    EventEmitter,
    EndOfLine,
    CancellationTokenSource,
    WorkspaceEdit,
    window: {
        showInformationMessage: () => undefined,
        showWarningMessage: () => undefined,
        showQuickPick: () => undefined,
        showInputBox: () => undefined,
        createOutputChannel() {
            return null
        },
        showErrorMessage(message: string) {
            console.error(message)
        },
        activeTextEditor: { document: { uri: { scheme: 'not-cody' } }, options: { tabSize: 4 } },
        onDidChangeActiveTextEditor() {},
    },
    workspace: {
        getConfiguration() {
            return {
                get(key: string) {
                    switch (key) {
                        case 'cody.debug.filter':
                            return '.*'
                        default:
                            return ''
                    }
                },
            }
        },
        openTextDocument: (uri: string) => ({
            getText: () => 'foo\nbar\nfoo',
            save: () => true,
        }),
        applyEdit: (edit: WorkspaceEdit) => true,
        save: () => true,
    },
    ConfigurationTarget: {
        Global: undefined,
    },
    Uri: {
        file: (path: string) => ({
            fsPath: path,
            path,
        }),
    },
    extensions: {
        getExtension() {
            return undefined
        },
    },
} as const
