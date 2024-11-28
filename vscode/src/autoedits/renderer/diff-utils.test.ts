import { describe, expect, it } from 'vitest'
import type { DecorationInfo } from './decorators/base'
import { getDecorationInfo } from './diff-utils'

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
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'line2',
                            newText: 'modified2',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'line2',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'modified2',
                                },
                            ],
                        },
                    ],
                    unchangedLines: [
                        {
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'line1',
                        },
                        {
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
                    addedLines: [{ type: 'added', modifiedLineNumber: 2, text: 'line3' }],
                    removedLines: [],
                    modifiedLines: [],
                    unchangedLines: [
                        {
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'line1',
                        },
                        {
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
                    removedLines: [{ type: 'removed', originalLineNumber: 1, text: 'line2' }],
                    modifiedLines: [],
                    unchangedLines: [
                        {
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'line1',
                        },
                        {
                            type: 'unchanged',
                            originalLineNumber: 1,
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
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'line2',
                            newText: 'modified2',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'line2',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'modified2',
                                },
                            ],
                        },
                        {
                            type: 'modified',
                            originalLineNumber: 2,
                            modifiedLineNumber: 2,
                            oldText: 'line3',
                            newText: 'newline',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'line3',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'newline',
                                },
                            ],
                        },
                    ],
                    unchangedLines: [
                        {
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'line1',
                        },
                        {
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
                    addedLines: [{ type: 'added', modifiedLineNumber: 5, text: 'add2' }],
                    removedLines: [
                        {
                            originalLineNumber: 2,
                            text: 'removeLine1',
                            type: 'removed',
                        },
                    ],
                    modifiedLines: [
                        {
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 1,
                            oldText: 'remove1',
                            newText: 'modified1',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'remove1',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'modified1',
                                },
                            ],
                        },
                        {
                            type: 'modified',
                            originalLineNumber: 3,
                            modifiedLineNumber: 3,
                            oldText: 'remove2',
                            newText: 'add1',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'remove2',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'add1',
                                },
                            ],
                        },
                        {
                            type: 'modified',
                            originalLineNumber: 4,
                            modifiedLineNumber: 4,
                            oldText: 'modify2',
                            newText: 'modified2',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'modify2',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'modified2',
                                },
                            ],
                        },
                    ],
                    unchangedLines: [
                        {
                            type: 'unchanged',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            text: 'keep1',
                        },
                        {
                            type: 'unchanged',
                            originalLineNumber: 2,
                            modifiedLineNumber: 0,
                            text: 'keep2',
                        },
                        {
                            type: 'unchanged',
                            originalLineNumber: 6,
                            modifiedLineNumber: 0,
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
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: 'line1',
                            newText: 'different1',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'line1',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'different1',
                                },
                            ],
                        },
                        {
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 0,
                            oldText: 'line2',
                            newText: 'different2',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'line2',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'different2',
                                },
                            ],
                        },
                        {
                            type: 'modified',
                            originalLineNumber: 2,
                            modifiedLineNumber: 0,
                            oldText: 'line3',
                            newText: 'different3',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'line3',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'different3',
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
                        { type: 'added', modifiedLineNumber: 0, text: 'line2' },
                        { type: 'added', modifiedLineNumber: 0, text: 'line3' },
                    ],
                    modifiedLines: [
                        {
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: '',
                            newText: 'line1',
                            changes: [
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'line1',
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
                        { type: 'removed', originalLineNumber: 1, text: 'line2' },
                        { type: 'removed', originalLineNumber: 2, text: 'line3' },
                    ],
                    modifiedLines: [
                        {
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: 'line1',
                            newText: '',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'line1',
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
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: '  line1',
                            newText: 'line1',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: '  ',
                                },
                            ],
                        },
                        {
                            type: 'modified',
                            originalLineNumber: 1,
                            modifiedLineNumber: 0,
                            oldText: 'line2  ',
                            newText: 'line2',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: '  ',
                                },
                            ],
                        },
                        {
                            type: 'modified',
                            originalLineNumber: 2,
                            modifiedLineNumber: 0,
                            oldText: ' line3 ',
                            newText: 'line3',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: ' ',
                                },
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: ' ',
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
                            type: 'modified',
                            originalLineNumber: 0,
                            modifiedLineNumber: 0,
                            oldText: 'const value = 123',
                            newText: 'const span = trace.getActiveTrace()',
                            changes: [
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: 'value',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'span',
                                },
                                {
                                    type: 'delete',
                                    range: expect.anything(),
                                    text: '123',
                                },
                                {
                                    type: 'insert',
                                    range: expect.anything(),
                                    text: 'trace.getActiveTrace()',
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
