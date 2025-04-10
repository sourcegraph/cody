// TODO: figure out how to reuse this in the agent and vscode packages
// if we add vscode to the tsconfig project references to import protocol
// types, we get a circular dependency error.
import type { Position } from 'vscode'

/**
 * Utility class to convert line/character positions into offsets.
 */
export class DocumentOffsets {
    private lines: number[] = []
    private content: string
    constructor(public readonly document: { content?: null | string }) {
        this.content = document?.content || ''
        this.lines.push(0)
        let index = 0
        while (index < this.content.length) {
            if (this.content[index] === '\n') {
                this.lines.push(index + 1)
            }
            index++
        }
        if (this.content.length !== this.lines.at(-1)) {
            this.lines.push(this.content.length) // sentinel value
        }
    }
    public lineCount(): number {
        return this.lines.length - 1
    }
    public lineStartOffset(line: number): number {
        return line < this.lines.length ? this.lines[line] : this.lines.at(-1)!
    }
    public lineEndOffset(line: number): number {
        const nextLine = line + 1
        return nextLine < this.lines.length ? this.lines[nextLine] : this.document.content?.length ?? 0
    }
    public newlineLength(line: number): number {
        const endOffset = this.lineEndOffset(line)
        const isEndOfFile = endOffset === this.content.length
        const hasNewlineAtEndOfFile = this.content.endsWith('\n')
        if (isEndOfFile && !hasNewlineAtEndOfFile) {
            return 0
        }
        const isCarriageReturn = endOffset > 1 && this.content[endOffset - 2] === '\r'
        return isCarriageReturn ? 2 : 1
    }
    public lineLengthIncludingNewline(line: number): number {
        return this.lineEndOffset(line) - this.lineStartOffset(line)
    }
    public lineLengthExcludingNewline(line: number): number {
        return this.lineLengthIncludingNewline(line) - this.newlineLength(line)
    }
    public offset(position: Position): number {
        return (
            this.lineStartOffset(position.line) +
            Math.min(position.character, this.lineLengthIncludingNewline(position.line))
        )
    }
    public position(offset: number): { line: number; character: number } {
        let line = 0
        // TODO: use binary search to optimize this part.
        while (line < this.lines.length - 1 && offset >= this.lines[line + 1]) {
            line++
        }
        return {
            line,
            character: offset - this.lines[line],
        }
    }
}
