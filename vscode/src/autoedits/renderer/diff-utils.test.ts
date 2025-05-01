import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import type { DecorationInfo, ModifiedLineInfo } from './decorators/base'
import { getDecorationInfo, getDecorationStats } from './diff-utils'

/**
 * A more concise version of `decorationInfo` for test assertions.
 * Excludes `changes` from modifiedLines as this can result in large/unreadable assertions
 */
interface DecorationInfoForTest extends Omit<DecorationInfo, 'modifiedLines'> {
    modifiedLines: Omit<ModifiedLineInfo, 'changes'>[]
}

describe('getDecorationInfo', () => {
    const newLineChars = ['\n', '\r\n']

    for (const newLineChar of newLineChars) {
        describe(`with line separator: ${newLineChar === '\n' ? '\\n' : '\\r\\n'}`, () => {
            it('should identify modified lines', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3`
                const modifiedText = `line1${newLineChar}modified2${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected = {
                    addedLines: [],
                    removedLines: [],
                    modifiedLines: [
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'line2',
                            newText: 'modified2',
                        },
                    ],
                    unchangedLines: [
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'line1',
                        },
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 2,
                            modifiedLineNumber: 2,
                            text: 'line3',
                        },
                    ],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should identify added lines', () => {
                const originalText = `line1${newLineChar}line2`
                const modifiedText = `line1${newLineChar}line2${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [
                        {
                            id: expect.any(String),
                            type: 'added',
                            modifiedLineNumber: 2,
                            text: 'line3',
                        },
                    ],
                    removedLines: [],
                    modifiedLines: [],
                    unchangedLines: [
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'line1',
                        },
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            text: 'line2',
                        },
                    ],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should identify removed lines', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3`
                const modifiedText = `line1${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [],
                    removedLines: [
                        {
                            id: expect.any(String),
                            type: 'removed',
                            originalLineNumber: 1,
                            text: 'line2',
                        },
                    ],
                    modifiedLines: [],
                    unchangedLines: [
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'line1',
                        },
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 2,
                            modifiedLineNumber: 1,
                            text: 'line3',
                        },
                    ],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should handle changes with multiple modified lines', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3${newLineChar}line4`
                const modifiedText = `line1${newLineChar}modified2${newLineChar}newline${newLineChar}line4`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [],
                    removedLines: [],
                    modifiedLines: [
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'line2',
                            newText: 'modified2',
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 2,
                            modifiedLineNumber: 2,
                            oldText: 'line3',
                            newText: 'newline',
                        },
                    ],
                    unchangedLines: [
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'line1',
                        },
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 3,
                            modifiedLineNumber: 3,
                            text: 'line4',
                        },
                    ],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should handle empty input', () => {
                const originalText = ''
                const modifiedText = ''

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [],
                    removedLines: [],
                    modifiedLines: [],
                    unchangedLines: [
                        {
                            id: expect.any(String),
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: '',
                            type: 'unchanged',
                        },
                    ],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should handle multiple modifications, additions, and removals', () => {
                const originalText = `keep1${newLineChar}remove1${newLineChar}removeLine1${newLineChar}keep2${newLineChar}remove2${newLineChar}modify2${newLineChar}keep3`
                const modifiedText = `keep1${newLineChar}modified1${newLineChar}keep2${newLineChar}add1${newLineChar}modified2${newLineChar}add2${newLineChar}keep3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [
                        {
                            id: expect.any(String),
                            type: 'added',
                            modifiedLineNumber: 5,
                            text: 'add2',
                        },
                    ],
                    removedLines: [
                        {
                            id: expect.any(String),
                            originalLineNumber: 2,
                            text: 'removeLine1',
                            type: 'removed',
                        },
                    ],
                    modifiedLines: [
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'remove1',
                            newText: 'modified1',
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 4,
                            modifiedLineNumber: 3,
                            oldText: 'remove2',
                            newText: 'add1',
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 5,
                            modifiedLineNumber: 4,
                            oldText: 'modify2',
                            newText: 'modified2',
                        },
                    ],
                    unchangedLines: [
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'keep1',
                        },
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 3,
                            modifiedLineNumber: 2,
                            text: 'keep2',
                        },
                        {
                            id: expect.any(String),
                            type: 'unchanged',
                            originalLineNumber: 6,
                            modifiedLineNumber: 6,
                            text: 'keep3',
                        },
                    ],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should handle completely different content', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3`
                const modifiedText = `different1${newLineChar}different2${newLineChar}different3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [],
                    removedLines: [],
                    modifiedLines: [
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: 'line1',
                            newText: 'different1',
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'line2',
                            newText: 'different2',
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 2,
                            modifiedLineNumber: 2,
                            oldText: 'line3',
                            newText: 'different3',
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should handle one empty input (original text empty)', () => {
                const originalText = ''
                const modifiedText = `line1${newLineChar}line2${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [
                        {
                            id: expect.any(String),
                            type: 'added',
                            modifiedLineNumber: 1,
                            text: 'line2',
                        },
                        {
                            id: expect.any(String),
                            type: 'added',
                            modifiedLineNumber: 2,
                            text: 'line3',
                        },
                    ],
                    modifiedLines: [
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: '',
                            newText: 'line1',
                        },
                    ],
                    removedLines: [],
                    unchangedLines: [],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should handle one empty input (modified text empty)', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3`
                const modifiedText = ''

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [],
                    removedLines: [
                        {
                            id: expect.any(String),
                            type: 'removed',
                            originalLineNumber: 1,
                            text: 'line2',
                        },
                        {
                            id: expect.any(String),
                            type: 'removed',
                            originalLineNumber: 2,
                            text: 'line3',
                        },
                    ],
                    modifiedLines: [
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: 'line1',
                            newText: '',
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should handle arrays with only whitespace differences', () => {
                const originalText = `  line1${newLineChar}line2  ${newLineChar} line3 `
                const modifiedText = `line1${newLineChar}line2${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [],
                    removedLines: [],
                    modifiedLines: [
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: '  line1',
                            newText: 'line1',
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'line2  ',
                            newText: 'line2',
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 2,
                            modifiedLineNumber: 2,
                            oldText: ' line3 ',
                            newText: 'line3',
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should merge adjacent insertions and deletions into separate changes', () => {
                const originalText = 'const value = 123'
                const modifiedText = 'const span = trace.getActiveTrace()'

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [],
                    removedLines: [],
                    modifiedLines: [
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: 'const value = 123',
                            newText: 'const span = trace.getActiveTrace()',
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toMatchObject(expected)
            })

            it('should merge adjacent insertions and deletions into separate changes', () => {
                const originalText = '            '
                const modifiedText = `        elif field == "email":${newLineChar}            return self.email`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfoForTest = {
                    addedLines: [
                        {
                            id: expect.any(String),
                            type: 'added',
                            text: '            return self.email',
                            modifiedLineNumber: 1,
                        },
                    ],
                    removedLines: [],
                    modifiedLines: [
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: '            ',
                            newText: '        elif field == "email":',
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toMatchObject(expected)
            })
        })
    }
})

describe('getDecorationStats', () => {
    it('handles added, removed, modified, and unchanged lines', () => {
        const originalText = dedent`
            function greet(name: string) {
              console.log('Hello {name}')
            }

            console.log('unchanged line')
            const unused = ""
        `

        const modifiedText = dedent`
            function greet(name: string) {
              console.log('Hello Brave {name}')
            }
            console.log('unchanged line')
            const used = "Bob"
            greet(used)
        `

        const decorationInfo = getDecorationInfo(originalText, modifiedText)
        const stats = getDecorationStats(decorationInfo)

        expect(stats).toEqual({
            modifiedLines: 2, // "console.log('Hello Brave {name}')" and "const used = "Bob""
            removedLines: 1, // empty line after the function definition
            addedLines: 1, // "greet(newVar)"
            unchangedLines: 3,
            addedChars: ('Brave ' + 'used' + 'Bob' + 'greet(used)').length,
            removedChars: 'unused'.length,
            unchangedChars: 100,
        })
    })
})
