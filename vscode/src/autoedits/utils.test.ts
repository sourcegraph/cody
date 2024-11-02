import { describe, expect, it } from 'vitest'
import * as utils from './utils'

describe('fixFirstLineIndentation', () => {
    it('should preserve source indentation for first line', () => {
        const source = '    const x = 1;\nconst y = 2;'
        const target = 'const x = 1;\nconst y = 2;'

        const result = utils.fixFirstLineIndentation(source, target)

        expect(result).toBe('    const x = 1;\nconst y = 2;')
    })

    it('should handle tabs in source indentation', () => {
        const source = '\tconst x = 1;\nconst y = 2;'
        const target = 'const x = 1;\nconst y = 2;'

        const result = utils.fixFirstLineIndentation(source, target)

        expect(result).toBe('\tconst x = 1;\nconst y = 2;')
    })

    it('should handle no indentation in source', () => {
        const source = 'const x = 1;\nconst y = 2;'
        const target = '    const x = 1;\nconst y = 2;'

        const result = utils.fixFirstLineIndentation(source, target)

        expect(result).toBe('const x = 1;\nconst y = 2;')
    })

    it('should handle new line at the end of target', () => {
        const source = '    const x = 1;\n        const y = 2;'
        const target = 'const x = 1;\n        const y = 2\n'

        const result = utils.fixFirstLineIndentation(source, target)

        expect(result).toBe('    const x = 1;\n        const y = 2\n')
    })

    it('should handle empty response', () => {
        const source = '    const x = 1;\n        const y = 2;'
        const target = ''

        const result = utils.fixFirstLineIndentation(source, target)

        expect(result).toBe('    ')
    })
})

describe('splitLinesKeepEnds', () => {
    it('handles empty string', () => {
        expect(utils.splitLinesKeepEnds('')).toEqual([''])
    })

    it('handles single line without line ending', () => {
        expect(utils.splitLinesKeepEnds('hello')).toEqual(['hello'])
    })

    it('handles Windows line endings (CRLF)', () => {
        expect(utils.splitLinesKeepEnds('line1\r\nline2\r\n')).toEqual(['line1\r\n', 'line2\r\n'])
    })

    it('handles Unix line endings (LF)', () => {
        expect(utils.splitLinesKeepEnds('line1\nline2\n')).toEqual(['line1\n', 'line2\n'])
    })

    it('handles old Mac line endings (CR)', () => {
        expect(utils.splitLinesKeepEnds('line1\rline2\r')).toEqual(['line1\r', 'line2\r'])
    })

    it('handles mixed line endings', () => {
        expect(utils.splitLinesKeepEnds('line1\nline2\r\nline3\rline4')).toEqual([
            'line1\n',
            'line2\r\n',
            'line3\r',
            'line4',
        ])
    })

    it('handles multiple consecutive line endings', () => {
        expect(utils.splitLinesKeepEnds('line1\n\n\nline2')).toEqual(['line1\n', '\n', '\n', 'line2'])
    })

    it('handles single line with line ending', () => {
        expect(utils.splitLinesKeepEnds('hello\n')).toEqual(['hello\n'])
    })

    it('handles string with line endings at the end', () => {
        expect(utils.splitLinesKeepEnds('line1\nline2\n')).toEqual(['line1\n', 'line2\n'])
    })

    it('handles multiple consecutive line endings at the end', () => {
        expect(utils.splitLinesKeepEnds('line1\nline2\n\n')).toEqual(['line1\n', 'line2\n', '\n'])
    })

    it('handles string with only line endings', () => {
        expect(utils.splitLinesKeepEnds('\n')).toEqual(['\n'])
        expect(utils.splitLinesKeepEnds('\n\n')).toEqual(['\n', '\n'])
    })

    it('handles CRLF with no content', () => {
        expect(utils.splitLinesKeepEnds('\r\n')).toEqual(['\r\n'])
        expect(utils.splitLinesKeepEnds('\r\n\r\n')).toEqual(['\r\n', '\r\n'])
    })

    it('handles mixed endings with empty lines in between', () => {
        expect(utils.splitLinesKeepEnds('line1\r\n\nline2\r\n\r\nline3')).toEqual([
            'line1\r\n',
            '\n',
            'line2\r\n',
            '\r\n',
            'line3',
        ])
    })

    it('handles Unicode characters with Windows endings', () => {
        expect(utils.splitLinesKeepEnds('🌟\r\n你好\r\nこんにちは')).toEqual([
            '🌟\r\n',
            '你好\r\n',
            'こんにちは',
        ])
    })

    it('handles zero-width characters and spaces', () => {
        expect(utils.splitLinesKeepEnds('\u200B\r\n \u200B\r\n\u200B')).toEqual([
            '\u200B\r\n',
            ' \u200B\r\n',
            '\u200B',
        ])
    })

    it('handles lone in middle of CRLF content', () => {
        expect(utils.splitLinesKeepEnds('line1\r\nline2\rline3\r\n')).toEqual([
            'line1\r\n',
            'line2\r',
            'line3\r\n',
        ])
    })

    it('handles whitespace-only lines with different endings', () => {
        expect(utils.splitLinesKeepEnds('  \r\n\t\n    \r')).toEqual(['  \r\n', '\t\n', '    \r'])
    })
})

describe('extractInlineCompletionFromRewrittenCode', () => {
    it('handles basic case', () => {
        const prediction = 'const prefix = 1;\nconst middle = 2;\nconst suffix = 3;'
        const prefix = 'const prefix = 1;\n'
        const suffix = '\nconst suffix = 3;'

        const result = utils.extractInlineCompletionFromRewrittenCode(prediction, prefix, suffix)
        expect(result).toBe('const middle = 2;')
    })

    it('handles empty prefix and suffix', () => {
        const prediction = 'const x = 1;'
        const prefix = ''
        const suffix = ''

        const result = utils.extractInlineCompletionFromRewrittenCode(prediction, prefix, suffix)
        expect(result).toBe('const x = 1;')
    })

    it('handles multiline completion', () => {
        const prediction = 'prefix\nline1\nline2\nline3\nsuffix'
        const prefix = 'prefix\n'
        const suffix = '\nsuffix'

        const result = utils.extractInlineCompletionFromRewrittenCode(prediction, prefix, suffix)
        expect(result).toBe('line1\nline2\nline3')
    })

    it('same line suffix test', () => {
        const prediction = 'const prefix = 1;\nconst middle = 2;\nconst suffix = 3;'
        const prefix = 'const prefix = 1;\n'
        const suffix = 'middle = 2;\nconst suffix = 3;'

        const result = utils.extractInlineCompletionFromRewrittenCode(prediction, prefix, suffix)
        expect(result).toBe('const middle = 2;')
    })

    it('same line suffix test (with multiple lines)', () => {
        const prediction =
            'const prefix = 1;\nconst middle = 2;\nconst suffix = 3;\nconst superSuffix = 4;'
        const prefix = 'const prefix = '
        const suffix = '= 3;\nconst superSuffix = 4;'

        const result = utils.extractInlineCompletionFromRewrittenCode(prediction, prefix, suffix)
        expect(result).toBe('1;\nconst middle = 2;\nconst suffix = 3;')
    })
})
