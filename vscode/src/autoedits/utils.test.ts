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

describe('trimNewLineCharsFromString', () => {
    it('removes leading newlines', () => {
        const input = '\n\nHello World'
        const expected = 'Hello World'
        expect(utils.trimNewLineCharsFromString(input)).toBe(expected)
    })

    it('removes single newlines', () => {
        const input = '\nHello World'
        const expected = 'Hello World'
        expect(utils.trimNewLineCharsFromString(input)).toBe(expected)
    })

    it('removes with whitespace chars newlines', () => {
        const input = '\n   \nHello World \n  \n\n'
        const expected = '   \nHello World \n  '
        expect(utils.trimNewLineCharsFromString(input)).toBe(expected)
    })

    it('removes trailing newlines', () => {
        const input = 'Hello World\n\n'
        const expected = 'Hello World'
        expect(utils.trimNewLineCharsFromString(input)).toBe(expected)
    })

    it('removes leading and trailing newlines', () => {
        const input = '\nHello World\n'
        const expected = 'Hello World'
        expect(utils.trimNewLineCharsFromString(input)).toBe(expected)
    })

    it('does not remove newlines in the middle of the string', () => {
        const input = 'Hello\nWorld'
        const expected = 'Hello\nWorld'
        expect(utils.trimNewLineCharsFromString(input)).toBe(expected)
    })

    it('returns empty string when input is only newlines', () => {
        const input = '\n\n'
        const expected = ''
        expect(utils.trimNewLineCharsFromString(input)).toBe(expected)
    })

    it('returns the same string when there are no leading or trailing newlines', () => {
        const input = 'Hello World'
        const expected = 'Hello World'
        expect(utils.trimNewLineCharsFromString(input)).toBe(expected)
    })

    it('handles empty string input', () => {
        const input = ''
        const expected = ''
        expect(utils.trimNewLineCharsFromString(input)).toBe(expected)
    })

    it('handles Windows line endings (CRLF)', () => {
        expect(utils.trimNewLineCharsFromString('\r\ntext\r\n')).toBe('text')
        expect(utils.trimNewLineCharsFromString('\r\n\r\ntext\r\n\r\n')).toBe('text')
    })

    it('handles Unix line endings (LF)', () => {
        expect(utils.trimNewLineCharsFromString('\ntext\n')).toBe('text')
        expect(utils.trimNewLineCharsFromString('\n\ntext\n\n')).toBe('text')
    })

    it('handles mixed line endings', () => {
        expect(utils.trimNewLineCharsFromString('\n\r\ntext\r\n\n')).toBe('text')
        expect(utils.trimNewLineCharsFromString('\r\n\ntext\n\r\n')).toBe('text')
    })

    it('preserves internal line endings', () => {
        expect(utils.trimNewLineCharsFromString('\r\ntext\nmore\r\ntext\r\n')).toBe('text\nmore\r\ntext')
        expect(utils.trimNewLineCharsFromString('\ntext\r\nmore\ntext\n')).toBe('text\r\nmore\ntext')
    })
})

describe('isAllNewLineChars', () => {
    it('should return true for an empty string', () => {
        expect(utils.isAllNewLineChars('')).toBe(true)
    })

    it('should return true for a string with only newlines', () => {
        expect(utils.isAllNewLineChars('\n')).toBe(true)
        expect(utils.isAllNewLineChars('\n\n')).toBe(true)
        expect(utils.isAllNewLineChars('\r')).toBe(true)
        expect(utils.isAllNewLineChars('\r\n')).toBe(true)
        expect(utils.isAllNewLineChars('\n\r\n\r')).toBe(true)
    })

    it('should return false for a string with non-newline characters', () => {
        expect(utils.isAllNewLineChars('a')).toBe(false)
        expect(utils.isAllNewLineChars(' \n')).toBe(false)
        expect(utils.isAllNewLineChars('\n ')).toBe(false)
        expect(utils.isAllNewLineChars('abc')).toBe(false)
        expect(utils.isAllNewLineChars('\nabc')).toBe(false)
        expect(utils.isAllNewLineChars('abc\n')).toBe(false)
    })

    it('should return false for a string with whitespace other than newlines', () => {
        expect(utils.isAllNewLineChars(' ')).toBe(false)
        expect(utils.isAllNewLineChars('\t')).toBe(false)
        expect(utils.isAllNewLineChars(' \t\n')).toBe(false)
        expect(utils.isAllNewLineChars('\n\t ')).toBe(false)
    })
})

describe('adjustPredictionIfInlineCompletionPossible', () => {
    it('prediction when the prefix matches partially with suffix', () => {
        const originalPrediction = '\n    private async func {\n'
        const prefix = '\n    private '
        const suffix = '\n\n    private async func {\n'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(originalPrediction)
    })

    it('returns original prediction if prefix or suffix not found', () => {
        const originalPrediction = 'some code'
        const prefix = 'prefix'
        const suffix = 'suffix'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(originalPrediction)
    })

    it('adjusts the prediction when prefix and suffix are found and surrounding content is only new lines', () => {
        const originalPrediction = '\n\nfunction test() {\n  console.log("Test");\n}\n\n'
        const prefix = '\nfunction test() {'
        const suffix = '}'
        const expected = '\nfunction test() {\n  console.log("Test");\n}'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('returns original prediction if content before prefix is not all new lines', () => {
        const originalPrediction = 'var a = 1;\nfunction test() {\n  console.log(a);\n}\n'
        const prefix = 'function test() {'
        const suffix = '}'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(originalPrediction)
    })

    it('returns original prediction if content after suffix is not all new lines', () => {
        const originalPrediction = '\nfunction test() {\n  console.log("Test");\n}\nconsole.log("Done");'
        const prefix = '\nfunction test() {'
        const suffix = '}'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(originalPrediction)
    })

    it('handles cases where prefix and suffix are adjacent', () => {
        const originalPrediction = '\n\nprefixsuffix\n\n'
        const prefix = 'prefix'
        const suffix = 'suffix'
        const expected = 'prefixsuffix'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('trims new line characters correctly', () => {
        const originalPrediction = '\n\n  content with new lines  \n\n'
        const prefix = '\n  content'
        const suffix = 'new lines  \n'
        const expected = '\n  content with new lines  \n'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('returns prediction when prefix is empty', () => {
        const originalPrediction = '\nfunction test() {\n  console.log("Test");\n}\n'
        const prefix = ''
        const suffix = '}'
        const expected = '\nfunction test() {\n  console.log("Test");\n}'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('returns original prediction when suffix is empty', () => {
        const originalPrediction = '\nfunction test() {\n  console.log("Test");\n}\n'
        const prefix = 'function test() {'
        const suffix = ''
        const expected = 'function test() {\n  console.log("Test");\n}\n'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles empty prefix and suffix', () => {
        const originalPrediction = '\n\nSome content\n\n'
        const prefix = ''
        const suffix = ''
        const expected = '\n\nSome content\n\n'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles strings with only newlines in original prediction, prefix, and suffix', () => {
        const originalPrediction = '\n\n\n'
        const prefix = '\n'
        const suffix = '\n'
        const expected = '\n\n\n'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles multiple occurrences of the suffix in the original prediction', () => {
        const originalPrediction = '\nsome code\nsuffix\nmore code\nsuffix\n'
        const prefix = 'some code\n'
        const suffix = 'suffix\n'
        const expected = 'some code\nsuffix\nmore code\nsuffix\n'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles when original prediction is only newlines', () => {
        const originalPrediction = '\n\n\n'
        const prefix = '\n\n'
        const suffix = '\n'
        const expected = '\n\n\n'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles when completion to extract is empty', () => {
        const originalPrediction = 'prefixsuffix'
        const prefix = 'prefix'
        const suffix = 'suffix'
        const expected = 'prefixsuffix'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles when completion has only newlines and needs trimming', () => {
        const originalPrediction = '\nprefix\n\n\nsuffix\n'
        const prefix = 'prefix'
        const suffix = 'suffix'
        const expected = 'prefix\n\n\nsuffix'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles when completion has only newlines and needs trimming and overlapping new lines in between', () => {
        const originalPrediction = '\nprefix\n\n\nsuffix\n'
        const prefix = 'prefix\n'
        const suffix = '\n\nsuffix'
        const expected = 'prefix\n\n\nsuffix'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles when completion has only newlines and needs trimming and overlapping with extra new line chars', () => {
        const originalPrediction = '\nprefix\n\n\nsuffix\n'
        const prefix = 'prefix\n\n'
        const suffix = '\n\nsuffix'
        const expected = 'prefix\n\n\n\nsuffix'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles when prefix and suffix are identical', () => {
        const originalPrediction = '\nprefix\nmiddle content\nprefix\n'
        const prefix = 'prefix'
        const suffix = 'prefix'
        const expected = 'prefix\nmiddle content\nprefix'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles when suffix has extra chars', () => {
        const originalPrediction = '\nstart\nsuffix\nmiddle\nsuffix\nend\n'
        const prefix = 'start\n'
        const suffix = 'suffix\n'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(originalPrediction)
    })

    it('handles when suffix repeats multiple times in original prediction', () => {
        const originalPrediction = '\nstart\nsuffix\nmiddle\nsuffix\n\n'
        const prefix = 'start\n'
        const suffix = 'suffix\n'
        const expected = 'start\nsuffix\nmiddle\nsuffix\n'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('handles when all parameters are empty strings', () => {
        const originalPrediction = ''
        const prefix = ''
        const suffix = ''
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe('')
    })

    it('handles when originalPrediction contains only newlines and spaces', () => {
        const originalPrediction = '\n \n\n '
        const prefix = '\n '
        const suffix = '\n '
        const expected = '\n \n\n '
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(expected)
    })

    it('returns original prediction when prediction before prefix contains non-newline characters', () => {
        const originalPrediction = 'code before\nprefix\ncompletion\nsuffix'
        const prefix = 'prefix'
        const suffix = 'suffix'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(originalPrediction)
    })

    it('returns original prediction when prediction after suffix contains non-newline characters', () => {
        const originalPrediction = 'prefix\ncompletion\nsuffix\ncode after'
        const prefix = 'prefix'
        const suffix = 'suffix'
        const result = utils.adjustPredictionIfInlineCompletionPossible(
            originalPrediction,
            prefix,
            suffix
        )
        expect(result).toBe(originalPrediction)
    })
})

describe('countNewLineCharsEnd', () => {
    it('handles Unix line endings (LF)', () => {
        expect(utils.countNewLineCharsEnd('text\n')).toBe(1)
        expect(utils.countNewLineCharsEnd('text\n\n')).toBe(2)
    })

    it('handles Windows line endings (CRLF)', () => {
        expect(utils.countNewLineCharsEnd('text\r\n')).toBe(2)
        expect(utils.countNewLineCharsEnd('text\r\n\r\n')).toBe(4)
    })

    it('handles mixed line endings', () => {
        expect(utils.countNewLineCharsEnd('text\n\r\n')).toBe(3)
        expect(utils.countNewLineCharsEnd('text\r\n\n')).toBe(3)
    })

    it('handles no line endings', () => {
        expect(utils.countNewLineCharsEnd('text')).toBe(0)
        expect(utils.countNewLineCharsEnd('')).toBe(0)
    })
})

describe('countNewLineCharsStart', () => {
    it('handles Unix line endings (LF)', () => {
        expect(utils.countNewLineCharsStart('\ntext')).toBe(1)
        expect(utils.countNewLineCharsStart('\n\ntext')).toBe(2)
    })

    it('handles Windows line endings (CRLF)', () => {
        expect(utils.countNewLineCharsStart('\r\ntext')).toBe(2)
        expect(utils.countNewLineCharsStart('\r\n\r\ntext')).toBe(4)
    })

    it('handles mixed line endings', () => {
        expect(utils.countNewLineCharsStart('\n\r\ntext')).toBe(3)
        expect(utils.countNewLineCharsStart('\r\n\ntext')).toBe(3)
    })

    it('handles no line endings', () => {
        expect(utils.countNewLineCharsStart('text')).toBe(0)
        expect(utils.countNewLineCharsStart('')).toBe(0)
    })
})
