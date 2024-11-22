import { describe, expect, it } from 'vitest'
import { getDecorationInfo } from './diff-utils'

import type { AddedLineInfo, DecorationInfo, ModifiedLineInfo } from './decorators/base'

describe('getDecorationInfo', () => {
    it('should identify modified lines', () => {
        const originalText = 'line1\nline2\nline3'
        const modifiedText = 'line1\nmodified2\nline3'

        const decorationInfo = getDecorationInfo(originalText, modifiedText)

        const expected: DecorationInfo = {
            addedLines: [],
            removedLines: [],
            modifiedLines: [
                {
                    type: 'modified',
                    lineNumber: 1, // Line number in the modified text
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
                { type: 'unchanged', lineNumber: 0, text: 'line1' },
                { type: 'unchanged', lineNumber: 2, text: 'line3' },
            ],
        }

        expect(decorationInfo).toEqual(expected)
    })

    it('should identify added lines', () => {
        const originalText = 'line1\nline2'
        const modifiedText = 'line1\nline2\nline3'

        const decorationInfo = getDecorationInfo(originalText, modifiedText)

        const expected: DecorationInfo = {
            addedLines: [{ type: 'added', lineNumber: 2, text: 'line3' }],
            removedLines: [],
            modifiedLines: [],
            unchangedLines: [
                { type: 'unchanged', lineNumber: 0, text: 'line1' },
                { type: 'unchanged', lineNumber: 1, text: 'line2' },
            ],
        }

        expect(decorationInfo).toEqual(expected)
    })

    it('should identify removed lines', () => {
        const originalText = 'line1\nline2\nline3'
        const modifiedText = 'line1\nline3'

        const decorationInfo = getDecorationInfo(originalText, modifiedText)

        const expected: DecorationInfo = {
            addedLines: [],
            removedLines: [{ type: 'removed', lineNumber: 1, text: 'line2' }],
            modifiedLines: [],
            unchangedLines: [
                { type: 'unchanged', lineNumber: 0, text: 'line1' },
                { type: 'unchanged', lineNumber: 1, text: 'line3' },
            ],
        }

        expect(decorationInfo).toEqual(expected)
    })

    it('should handle changes with multiple modified lines', () => {
        const originalText = 'line1\nline2\nline3\nline4'
        const modifiedText = 'line1\nmodified2\nnewline\nline4'

        const decorationInfo = getDecorationInfo(originalText, modifiedText)

        const expected: DecorationInfo = {
            addedLines: [],
            removedLines: [],
            modifiedLines: [
                {
                    type: 'modified',
                    lineNumber: 1,
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
                    lineNumber: 2,
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
                { type: 'unchanged', lineNumber: 0, text: 'line1' },
                { type: 'unchanged', lineNumber: 3, text: 'line4' },
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
                    lineNumber: 0,
                    text: '',
                    type: 'unchanged',
                },
            ],
        }

        expect(decorationInfo).toEqual(expected)
    })

    it('should handle multiple modifications, additions, and removals', () => {
        const originalText = 'keep1\nremove1\nremoveLine1\nkeep2\nremove2\nmodify2\nkeep3'
        const modifiedText = 'keep1\nmodified1\nkeep2\nadd1\nmodified2\nadd2\nkeep3'

        const decorationInfo = getDecorationInfo(originalText, modifiedText)

        const expected: DecorationInfo = {
            addedLines: [{ type: 'added', lineNumber: 5, text: 'add2' } as AddedLineInfo],
            removedLines: [
                {
                    lineNumber: 2,
                    text: 'removeLine1',
                    type: 'removed',
                },
            ],
            modifiedLines: [
                {
                    type: 'modified',
                    lineNumber: 1,
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
                    lineNumber: 3,
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
                    lineNumber: 4,
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
                { type: 'unchanged', lineNumber: 0, text: 'keep1' },
                { type: 'unchanged', lineNumber: 2, text: 'keep2' },
                { type: 'unchanged', lineNumber: 6, text: 'keep3' },
            ],
        }

        expect(decorationInfo).toEqual(expected)
    })

    it('should handle completely different content', () => {
        const originalText = 'line1\nline2\nline3'
        const modifiedText = 'different1\ndifferent2\ndifferent3'

        const decorationInfo = getDecorationInfo(originalText, modifiedText)

        const expected: DecorationInfo = {
            addedLines: [],
            removedLines: [],
            modifiedLines: [
                {
                    type: 'modified',
                    lineNumber: 0,
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
                    lineNumber: 1,
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
                    lineNumber: 2,
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
        const modifiedText = 'line1\nline2\nline3'

        const decorationInfo = getDecorationInfo(originalText, modifiedText)

        const expected: DecorationInfo = {
            addedLines: [
                { type: 'added', lineNumber: 1, text: 'line2' } as AddedLineInfo,
                { type: 'added', lineNumber: 2, text: 'line3' } as AddedLineInfo,
            ],
            modifiedLines: [
                {
                    type: 'modified',
                    lineNumber: 0,
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
        const originalText = 'line1\nline2\nline3'
        const modifiedText = ''

        const decorationInfo = getDecorationInfo(originalText, modifiedText)

        const expected: DecorationInfo = {
            addedLines: [],
            removedLines: [
                { type: 'removed', lineNumber: 1, text: 'line2' },
                { type: 'removed', lineNumber: 2, text: 'line3' },
            ],
            modifiedLines: [
                {
                    type: 'modified',
                    lineNumber: 0,
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
        const originalText = '  line1\nline2  \n line3 '
        const modifiedText = 'line1\nline2\nline3'

        const decorationInfo = getDecorationInfo(originalText, modifiedText)

        const expected: DecorationInfo = {
            addedLines: [],
            removedLines: [],
            modifiedLines: [
                {
                    type: 'modified',
                    lineNumber: 0,
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
                    lineNumber: 1,
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
                    lineNumber: 2,
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
                    lineNumber: 0,
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
                } as ModifiedLineInfo,
            ],
            unchangedLines: [],
        }

        expect(decorationInfo).toEqual(expected)
    })
})
