import { describe, expect, it } from 'vitest'
import { DocumentOffsets } from './offsets'
import type { Position, ProtocolTextDocument } from './protocol-alias'

describe('DocumentOffsets', () => {
    const content = `line 1
line 2
line 3`
    const lines = content.split('\n')
    const document = { content } as any as ProtocolTextDocument
    const docOffsets = new DocumentOffsets(document)

    it('counts the number of lines correctly', () => {
        expect(docOffsets.lineCount()).toBe(3)
    })

    it('gets the correct start offset of a line', () => {
        expect(docOffsets.lineStartOffset(0)).toBe(0)
        expect(docOffsets.lineStartOffset(1)).toBe(lines[0].length + 1)
        expect(docOffsets.lineStartOffset(2)).toBe(lines[0].length + lines[1].length + 2)
    })

    it('gets the correct end offset of a line', () => {
        expect(docOffsets.lineEndOffset(0)).toBe(lines[0].length + 1)
        expect(docOffsets.lineEndOffset(1)).toBe(lines[0].length + lines[1].length + 2)
        expect(docOffsets.lineEndOffset(2)).toBe(lines[0].length + lines[1].length + lines[2].length + 2)
    })

    it('gets the correct newline length of a line', () => {
        expect(docOffsets.newlineLength(0)).toBe(1)
        expect(docOffsets.newlineLength(1)).toBe(1)
        expect(docOffsets.newlineLength(2)).toBe(0)
    })

    it('converts position to offset correctly', () => {
        const position: Position = { line: 1, character: 3 }
        expect(docOffsets.offset(position)).toBe(10)
    })

    it('converts offset to position correctly', () => {
        const offset = 10
        expect(docOffsets.position(offset)).toStrictEqual({ line: 1, character: 3 })
    })

    it('handles out of bounds line numbers', () => {
        const position: Position = { line: 100, character: 3 }
        expect(docOffsets.offset(position)).toBe(20)
    })

    it('handles out of bounds offset', () => {
        const offset = 100
        expect(docOffsets.position(offset)).toStrictEqual({ line: 3, character: 80 })
    })
})
