import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { Position, Range } from '../../testutils/mocks'

import type { DecorationInfo } from './decorators/base'
import { getDecorationInfo, getDecorationStats } from './diff-utils'

describe('getDecorationInfo', () => {
    const newLineChars = ['\n', '\r\n']

    for (const newLineChar of newLineChars) {
        describe(`with line separator: ${newLineChar === '\n' ? '\\n' : '\\r\\n'}`, () => {
            it('should identify modified lines', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3`
                const modifiedText = `line1${newLineChar}modified2${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'line2',
                                    originalRange: new Range(new Position(1, 0), new Position(1, 5)),
                                    modifiedRange: new Range(new Position(1, 0), new Position(1, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'modified2',
                                    originalRange: new Range(new Position(1, 5), new Position(1, 5)),
                                    modifiedRange: new Range(new Position(1, 0), new Position(1, 9)),
                                },
                            ],
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

                expect(decorationInfo).toEqual(expected)
            })

            it('should identify added lines', () => {
                const originalText = `line1${newLineChar}line2`
                const modifiedText = `line1${newLineChar}line2${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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

                expect(decorationInfo).toEqual(expected)
            })

            it('should identify removed lines', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3`
                const modifiedText = `line1${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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

                expect(decorationInfo).toEqual(expected)
            })

            it('should handle changes with multiple modified lines', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3${newLineChar}line4`
                const modifiedText = `line1${newLineChar}modified2${newLineChar}newline${newLineChar}line4`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'line2',
                                    originalRange: new Range(new Position(1, 0), new Position(1, 5)),
                                    modifiedRange: new Range(new Position(1, 0), new Position(1, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'modified2',
                                    originalRange: new Range(new Position(1, 5), new Position(1, 5)),
                                    modifiedRange: new Range(new Position(1, 0), new Position(1, 9)),
                                },
                            ],
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 2,
                            modifiedLineNumber: 2,
                            oldText: 'line3',
                            newText: 'newline',
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'line3',
                                    originalRange: new Range(new Position(2, 0), new Position(2, 5)),
                                    modifiedRange: new Range(new Position(2, 0), new Position(2, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'newline',
                                    originalRange: new Range(new Position(2, 5), new Position(2, 5)),
                                    modifiedRange: new Range(new Position(2, 0), new Position(2, 7)),
                                },
                            ],
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

                expect(decorationInfo).toEqual(expected)
            })

            it('should handle empty input', () => {
                const originalText = ''
                const modifiedText = ''

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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

                expect(decorationInfo).toEqual(expected)
            })

            it('should handle multiple modifications, additions, and removals', () => {
                const originalText = `keep1${newLineChar}remove1${newLineChar}removeLine1${newLineChar}keep2${newLineChar}remove2${newLineChar}modify2${newLineChar}keep3`
                const modifiedText = `keep1${newLineChar}modified1${newLineChar}keep2${newLineChar}add1${newLineChar}modified2${newLineChar}add2${newLineChar}keep3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'remove1',
                                    originalRange: new Range(new Position(1, 0), new Position(1, 7)),
                                    modifiedRange: new Range(new Position(1, 0), new Position(1, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'modified1',
                                    originalRange: new Range(new Position(1, 7), new Position(1, 7)),
                                    modifiedRange: new Range(new Position(1, 0), new Position(1, 9)),
                                },
                            ],
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 4,
                            modifiedLineNumber: 3,
                            oldText: 'remove2',
                            newText: 'add1',
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'remove2',
                                    originalRange: new Range(new Position(4, 0), new Position(4, 7)),
                                    modifiedRange: new Range(new Position(3, 0), new Position(3, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'add1',
                                    originalRange: new Range(new Position(4, 7), new Position(4, 7)),
                                    modifiedRange: new Range(new Position(3, 0), new Position(3, 4)),
                                },
                            ],
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 5,
                            modifiedLineNumber: 4,
                            oldText: 'modify2',
                            newText: 'modified2',
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'modify2',
                                    originalRange: new Range(new Position(5, 0), new Position(5, 7)),
                                    modifiedRange: new Range(new Position(4, 0), new Position(4, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'modified2',
                                    originalRange: new Range(new Position(5, 7), new Position(5, 7)),
                                    modifiedRange: new Range(new Position(4, 0), new Position(4, 9)),
                                },
                            ],
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

                expect(decorationInfo).toEqual(expected)
            })

            it('should handle completely different content', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3`
                const modifiedText = `different1${newLineChar}different2${newLineChar}different3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'line1',
                                    originalRange: new Range(new Position(0, 0), new Position(0, 5)),
                                    modifiedRange: new Range(new Position(0, 0), new Position(0, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'different1',
                                    originalRange: new Range(new Position(0, 5), new Position(0, 5)),
                                    modifiedRange: new Range(new Position(0, 0), new Position(0, 10)),
                                },
                            ],
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'line2',
                            newText: 'different2',
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'line2',
                                    originalRange: new Range(new Position(1, 0), new Position(1, 5)),
                                    modifiedRange: new Range(new Position(1, 0), new Position(1, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'different2',
                                    originalRange: new Range(new Position(1, 5), new Position(1, 5)),
                                    modifiedRange: new Range(new Position(1, 0), new Position(1, 10)),
                                },
                            ],
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 2,
                            modifiedLineNumber: 2,
                            oldText: 'line3',
                            newText: 'different3',
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'line3',
                                    originalRange: new Range(new Position(2, 0), new Position(2, 5)),
                                    modifiedRange: new Range(new Position(2, 0), new Position(2, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'different3',
                                    originalRange: new Range(new Position(2, 5), new Position(2, 5)),
                                    modifiedRange: new Range(new Position(2, 0), new Position(2, 10)),
                                },
                            ],
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toEqual(expected)
            })

            it('should handle one empty input (original text empty)', () => {
                const originalText = ''
                const modifiedText = `line1${newLineChar}line2${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'line1',
                                    originalRange: new Range(new Position(0, 0), new Position(0, 0)),
                                    modifiedRange: new Range(new Position(0, 0), new Position(0, 5)),
                                },
                            ],
                        },
                    ],
                    removedLines: [],
                    unchangedLines: [],
                }

                expect(decorationInfo).toEqual(expected)
            })

            it('should handle one empty input (modified text empty)', () => {
                const originalText = `line1${newLineChar}line2${newLineChar}line3`
                const modifiedText = ''

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'line1',
                                    originalRange: new Range(new Position(0, 0), new Position(0, 5)),
                                    modifiedRange: new Range(new Position(0, 0), new Position(0, 0)),
                                },
                            ],
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toEqual(expected)
            })

            it('should handle arrays with only whitespace differences', () => {
                const originalText = `  line1${newLineChar}line2  ${newLineChar} line3 `
                const modifiedText = `line1${newLineChar}line2${newLineChar}line3`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: '  ',
                                    originalRange: new Range(new Position(0, 0), new Position(0, 2)),
                                    modifiedRange: new Range(new Position(0, 0), new Position(0, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'unchanged',
                                    text: 'line1',
                                    originalRange: new Range(new Position(0, 2), new Position(0, 7)),
                                    modifiedRange: new Range(new Position(0, 0), new Position(0, 5)),
                                },
                            ],
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'line2  ',
                            newText: 'line2',
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'unchanged',
                                    text: 'line2',
                                    originalRange: new Range(new Position(1, 0), new Position(1, 5)),
                                    modifiedRange: new Range(new Position(1, 0), new Position(1, 5)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: '  ',
                                    originalRange: new Range(new Position(1, 5), new Position(1, 7)),
                                    modifiedRange: new Range(new Position(1, 5), new Position(1, 5)),
                                },
                            ],
                        },
                        {
                            id: expect.any(String),
                            type: 'modified',
                            originalLineNumber: 2,
                            modifiedLineNumber: 2,
                            oldText: ' line3 ',
                            newText: 'line3',
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: ' ',
                                    originalRange: new Range(new Position(2, 0), new Position(2, 1)),
                                    modifiedRange: new Range(new Position(2, 0), new Position(2, 0)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'unchanged',
                                    text: 'line3',
                                    originalRange: new Range(new Position(2, 1), new Position(2, 6)),
                                    modifiedRange: new Range(new Position(2, 0), new Position(2, 5)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: ' ',
                                    originalRange: new Range(new Position(2, 6), new Position(2, 7)),
                                    modifiedRange: new Range(new Position(2, 5), new Position(2, 5)),
                                },
                            ],
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toEqual(expected)
            })

            it('should merge adjacent insertions and deletions into separate changes', () => {
                const originalText = 'const value = 123'
                const modifiedText = 'const span = trace.getActiveTrace()'

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'unchanged',
                                    text: 'const ',
                                    originalRange: new Range(new Position(0, 0), new Position(0, 6)),
                                    modifiedRange: new Range(new Position(0, 0), new Position(0, 6)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: 'value',
                                    originalRange: new Range(new Position(0, 6), new Position(0, 11)),
                                    modifiedRange: new Range(new Position(0, 6), new Position(0, 6)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'span',
                                    originalRange: new Range(new Position(0, 11), new Position(0, 11)),
                                    modifiedRange: new Range(new Position(0, 6), new Position(0, 10)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'unchanged',
                                    text: ' = ',
                                    originalRange: new Range(new Position(0, 11), new Position(0, 14)),
                                    modifiedRange: new Range(new Position(0, 10), new Position(0, 13)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: '123',
                                    originalRange: new Range(new Position(0, 14), new Position(0, 17)),
                                    modifiedRange: new Range(new Position(0, 13), new Position(0, 13)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'trace.getActiveTrace()',
                                    originalRange: new Range(new Position(0, 17), new Position(0, 17)),
                                    modifiedRange: new Range(new Position(0, 13), new Position(0, 35)),
                                },
                            ],
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toEqual(expected)
            })

            it('should merge adjacent insertions and deletions into separate changes', () => {
                const originalText = '            '
                const modifiedText = `        elif field == "email":${newLineChar}            return self.email`

                const decorationInfo = getDecorationInfo(originalText, modifiedText)

                const expected: DecorationInfo = {
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
                            changes: [
                                {
                                    id: expect.any(String),
                                    type: 'unchanged',
                                    text: '        ',
                                    originalRange: new Range(new Position(0, 0), new Position(0, 8)),
                                    modifiedRange: new Range(new Position(0, 0), new Position(0, 8)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'delete',
                                    text: '    ',
                                    originalRange: new Range(new Position(0, 8), new Position(0, 12)),
                                    modifiedRange: new Range(new Position(0, 8), new Position(0, 8)),
                                },
                                {
                                    id: expect.any(String),
                                    type: 'insert',
                                    text: 'elif field == "email":',
                                    originalRange: new Range(new Position(0, 12), new Position(0, 12)),
                                    modifiedRange: new Range(new Position(0, 8), new Position(0, 30)),
                                },
                            ],
                        },
                    ],
                    unchangedLines: [],
                }

                expect(decorationInfo).toEqual(expected)
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
