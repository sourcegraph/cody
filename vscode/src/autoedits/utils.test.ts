import { describe, expect, it } from 'vitest'

import type { CodeToReplaceData } from '@sourcegraph/cody-shared'
import { getNewLineChar } from '../completions/text-processing'
import { getAddedLines, getDecorationInfo } from './renderer/diff-utils'
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

describe('isDuplicatingTextFromRewriteArea', () => {
    function getAddedLineSnippet(codeToRewrite: string, prediction: string): string {
        const decorationInfo = getDecorationInfo(codeToRewrite, prediction)
        const addedLines = getAddedLines(decorationInfo)
        const newLineCharacter = getNewLineChar(codeToRewrite)
        return addedLines.map(line => line.text).join(newLineCharacter) + '\n'
    }

    it('should return false when there are no added lines', () => {
        const codeToReplaceData = {
            prefixBeforeArea: '',
            prefixInArea: '',
            suffixInArea: '',
            suffixAfterArea: '',
            codeToRewrite: 'const x = 1;\nconst y = 2;',
        } as CodeToReplaceData
        const prediction = 'const x = 1;\nconst y = 2;'

        const result = utils.isDuplicatingTextFromRewriteArea({
            addedText: getAddedLineSnippet(codeToReplaceData.codeToRewrite, prediction),
            codeToReplaceData,
        })
        expect(result).toBe(false)
    })

    it('should not hide if suffix or prefix matches by empty space', () => {
        const codeToReplaceData = {
            prefixBeforeArea: '',
            prefixInArea: '',
            suffixInArea: '',
            suffixAfterArea: '',
            codeToRewrite: 'const x = ',
        } as CodeToReplaceData
        const prediction = 'const x = 1\n'

        const result = utils.isDuplicatingTextFromRewriteArea({
            addedText: getAddedLineSnippet(codeToReplaceData.codeToRewrite, prediction),
            codeToReplaceData,
        })
        expect(result).toBe(false)
    })

    describe('suffix handling', () => {
        it('should return false when predicted text is different from suffix', () => {
            const codeToReplaceData = {
                prefixBeforeArea: '',
                prefixInArea: '',
                suffixInArea: 'return true;\n}',
                suffixAfterArea: '',
                codeToRewrite: 'function test() {\n    \n}',
            } as CodeToReplaceData
            const prediction = 'function test() {\n    console.log("hello");\n}'

            const result = utils.isDuplicatingTextFromRewriteArea({
                addedText: getAddedLineSnippet(codeToReplaceData.codeToRewrite, prediction),
                codeToReplaceData,
            })
            expect(result).toBe(false)
        })

        it('should handle multiline predictions correctly', () => {
            const codeToReplaceData = {
                prefixBeforeArea: '',
                prefixInArea: '',
                suffixInArea: '    const a = 1;\n    const b = 2;\n    console.log(a + b);\n}\n',
                suffixAfterArea: '',
                codeToRewrite: 'function test() {\n',
            } as CodeToReplaceData
            const prediction =
                'function test() {\n    const a = 1;\n    const b = 2;\n    console.log(a + b);\n}\n'

            const result = utils.isDuplicatingTextFromRewriteArea({
                addedText: getAddedLineSnippet(codeToReplaceData.codeToRewrite, prediction),
                codeToReplaceData,
            })
            expect(result).toBe(true)
        })

        it('should not hide if suffix matches by empty space', () => {
            const codeToReplaceData = {
                prefixBeforeArea: '',
                prefixInArea: '',
                suffixInArea: '',
                suffixAfterArea: '',
                codeToRewrite: 'const x = ',
            } as CodeToReplaceData
            const prediction = 'const x = 1\n'

            const result = utils.isDuplicatingTextFromRewriteArea({
                addedText: getAddedLineSnippet(codeToReplaceData.codeToRewrite, prediction),
                codeToReplaceData,
            })
            expect(result).toBe(false)
        })
    })

    describe('prefix handling', () => {
        it('should return false when predicted text is different from prefix', () => {
            const codeToReplaceData = {
                prefixBeforeArea: '',
                prefixInArea: 'function test() {\n    \n}',
                suffixInArea: '',
                suffixAfterArea: '',
                codeToRewrite: 'return true;\n}',
            } as CodeToReplaceData
            const prediction = 'function test() {\n    console.log("hello");\n}'

            const result = utils.isDuplicatingTextFromRewriteArea({
                addedText: getAddedLineSnippet(codeToReplaceData.codeToRewrite, prediction),
                codeToReplaceData,
            })
            expect(result).toBe(false)
        })

        it('should handle multiline predictions correctly', () => {
            const codeToReplaceData = {
                prefixBeforeArea: '',
                prefixInArea: 'function test() {\n',
                suffixInArea: '',
                suffixAfterArea: '',
                codeToRewrite: '    const a = 1;\n    const b = 2;\n    console.log(a + b);\n}\n',
            } as CodeToReplaceData
            const prediction =
                'function test() {\n    const a = 1;\n    const b = 2;\n    console.log(a + b);\n}\n'

            const result = utils.isDuplicatingTextFromRewriteArea({
                addedText: getAddedLineSnippet(codeToReplaceData.codeToRewrite, prediction),
                codeToReplaceData,
            })
            expect(result).toBe(true)
        })
    })
})
