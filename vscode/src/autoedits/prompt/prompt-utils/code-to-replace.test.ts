import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { NotebookCellKind } from 'vscode-languageserver-protocol'
import { getCurrentDocContext } from '../../../completions/get-current-doc-context'
import { documentAndPosition, mockNotebookAndPosition } from '../../../completions/test-helpers'
import { type CurrentFilePromptOptions, getCodeToReplaceData } from './code-to-replace'

// A helper to set up your global "activeNotebookEditor" mock.
function mockActiveNotebookEditor(notebook: vscode.NotebookDocument | undefined) {
    vi.spyOn(vscode.window, 'activeNotebookEditor', 'get').mockReturnValue(
        notebook
            ? ({
                  notebook,
              } as vscode.NotebookEditor)
            : undefined
    )
}

describe('getCodeToReplaceData', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('correctly handles the notebook document with only code cells', async () => {
        const { notebookDoc, position } = mockNotebookAndPosition({
            uri: 'file://test.ipynb',
            cells: [
                {
                    kind: NotebookCellKind.Code,
                    text: 'console.log("cell0 code")',
                    languageId: 'python',
                },
                {
                    kind: NotebookCellKind.Code,
                    text: 'console.log("cell1█ code")',
                    languageId: 'python',
                },
                {
                    kind: NotebookCellKind.Code,
                    text: 'console.log("cell2 code")',
                    languageId: 'python',
                },
            ],
        })
        mockActiveNotebookEditor(notebookDoc)
        const document = notebookDoc.cellAt(1).document

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const options: CurrentFilePromptOptions = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        // Verify the results
        expect(result.codeToRewrite).toBe('console.log("cell1 code")')
        expect(result.codeToRewritePrefix).toBe('console.log("cell1')
        expect(result.codeToRewriteSuffix).toBe(' code")')
        expect(result.prefixInArea).toBe('')
        expect(result.suffixInArea).toBe('')
        expect(result.prefixBeforeArea).toBe('console.log("cell0 code")\n')
        expect(result.suffixAfterArea).toBe('\nconsole.log("cell2 code")')
    })

    it('correctly handles the notebook document and relevant context', async () => {
        const { notebookDoc, position } = mockNotebookAndPosition({
            uri: 'file://test.ipynb',
            cells: [
                {
                    kind: NotebookCellKind.Code,
                    text: 'console.log("cell0 code")',
                    languageId: 'python',
                },
                {
                    kind: NotebookCellKind.Code,
                    text: 'console.log("cell1█ code")',
                    languageId: 'python',
                },
                {
                    kind: NotebookCellKind.Markup,
                    text: '# This is a markdown cell',
                    languageId: 'markdown',
                },
                {
                    kind: NotebookCellKind.Code,
                    text: 'console.log("cell2 code")',
                    languageId: 'python',
                },
            ],
        })
        mockActiveNotebookEditor(notebookDoc)
        const document = notebookDoc.cellAt(1).document

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const options = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        // Verify the results
        expect(result.codeToRewrite).toBe('console.log("cell1 code")')
        expect(result.codeToRewritePrefix).toBe('console.log("cell1')
        expect(result.codeToRewriteSuffix).toBe(' code")')
        expect(result.prefixInArea).toBe('')
        expect(result.suffixInArea).toBe('')
        expect(result.prefixBeforeArea).toBe('console.log("cell0 code")\n')
        expect(result.suffixAfterArea).toBe('\n# # This is a markdown cell\n\nconsole.log("cell2 code")')
    })

    it('correctly splits content into different areas based on cursor position', () => {
        const { document, position } = documentAndPosition('line1\nline2\nline3█line4\nline5\nline6')

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const options = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        // Verify the results
        expect(result.codeToRewrite).toBe('line2\nline3line4\nline5\n')
        expect(result.codeToRewritePrefix).toBe('line2\nline3')
        expect(result.codeToRewriteSuffix).toBe('line4\nline5\n')
        expect(result.prefixInArea).toBe('line1\n')
        expect(result.suffixInArea).toBe('line6')
        expect(result.prefixBeforeArea).toBe('')
        expect(result.suffixAfterArea).toBe('')
        expect(result.range.start.line).toBe(1)
        expect(result.range.end.line).toBe(4)
    })

    it('handles cursor at start of line', () => {
        const { document, position } = documentAndPosition('line1\nline2\n█line3\nline4\nline5')

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const options: CurrentFilePromptOptions = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        expect(result.codeToRewritePrefix).toBe('line2\n')
        expect(result.codeToRewriteSuffix).toBe('line3\nline4\n')
        expect(result.prefixInArea).toBe('line1\n')
        expect(result.suffixInArea).toBe('line5')
        expect(result.range.start.line).toBe(1)
        expect(result.range.end.line).toBe(4)
    })

    it('handles single line content', () => {
        const { document, position } = documentAndPosition('const foo = █bar')

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const options: CurrentFilePromptOptions = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        expect(result.codeToRewrite).toBe('const foo = bar')
        expect(result.codeToRewritePrefix).toBe('const foo = ')
        expect(result.codeToRewriteSuffix).toBe('bar')
        expect(result.prefixInArea).toBe('')
        expect(result.suffixInArea).toBe('')
        expect(result.range.start.line).toBe(0)
        expect(result.range.end.line).toBe(0)
    })

    it('handles cursor at start of file', () => {
        const { document, position } = documentAndPosition('█line1\nline2\nline3')

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const options: CurrentFilePromptOptions = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        expect(result.codeToRewrite).toBe('line1\nline2\n')
        expect(result.codeToRewritePrefix).toBe('')
        expect(result.codeToRewriteSuffix).toBe('line1\nline2\n')
        expect(result.prefixInArea).toBe('')
        expect(result.suffixInArea).toBe('line3')
        expect(result.range.start.line).toBe(0)
        expect(result.range.end.line).toBe(2)
    })

    it('handles cursor at end of file', () => {
        const { document, position } = documentAndPosition('line1\nline2\nline3█')

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const options: CurrentFilePromptOptions = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        expect(result.codeToRewrite).toBe('line2\nline3')
        expect(result.codeToRewritePrefix).toBe('line2\nline3')
        expect(result.codeToRewriteSuffix).toBe('')
        expect(result.prefixInArea).toBe('line1\n')
        expect(result.suffixInArea).toBe('')
        expect(result.range.start.line).toBe(1)
        expect(result.range.end.line).toBe(2)
    })

    it('handles large codeToRewritePrefixLines', () => {
        const { document, position } = documentAndPosition(
            'line1\nline2\nline3\nline4\nline5\n█line6\nline7'
        )

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const options: CurrentFilePromptOptions = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 3, // Increased prefix lines
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        expect(result.codeToRewrite).toBe('line3\nline4\nline5\nline6\nline7')
        expect(result.codeToRewritePrefix).toBe('line3\nline4\nline5\n')
        expect(result.codeToRewriteSuffix).toBe('line6\nline7')
        expect(result.prefixInArea).toBe('line2\n')
        expect(result.suffixInArea).toBe('')
        expect(result.range.start.line).toBe(2)
        expect(result.range.end.line).toBe(6)
    })

    it('handles very large file exceeding max lengths with large range', () => {
        // Create a large file content
        const longPrefix = Array(10).fill('prefix-line').join('\n')
        const longSuffix = Array(10).fill('suffix-line').join('\n')
        const content = `${longPrefix}\ncursor█line\n${longSuffix}`

        const { document, position } = documentAndPosition(content)

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 30,
            maxSuffixLength: 30,
        })

        const options: CurrentFilePromptOptions = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 1,
                maxSuffixLinesInArea: 1,
                codeToRewritePrefixLines: 1,
                codeToRewriteSuffixLines: 1,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        // Verify truncation behavior
        expect(result.prefixBeforeArea).toBe('')
        expect(result.suffixAfterArea).toBe('')
        expect(result.codeToRewrite).toContain('prefix-line\ncursorline\nsuffix-line\n')
        expect(result.codeToRewritePrefix).toContain('prefix-line\ncursor')
        expect(result.codeToRewriteSuffix).toContain('line\nsuffix-line\n')
        expect(result.range.start.line).toBe(9)
        expect(result.range.end.line).toBe(12)
    })

    it('handles very large file exceeding max lengths', () => {
        // Create a large file content
        const longPrefix = Array(10).fill('prefix-line').join('\n')
        const longSuffix = Array(10).fill('suffix-line').join('\n')
        const content = `${longPrefix}\ncursor█line\n${longSuffix}`

        const { document, position } = documentAndPosition(content)

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 20,
            maxSuffixLength: 20,
        })

        const options: CurrentFilePromptOptions = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 2,
                maxSuffixLinesInArea: 2,
                codeToRewritePrefixLines: 2,
                codeToRewriteSuffixLines: 2,
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        // Verify truncation behavior
        expect(result.prefixBeforeArea).toBe('')
        expect(result.suffixAfterArea).toBe('')
        expect(result.codeToRewrite).toContain('prefix-line\ncursorline\nsuffix-line')
        expect(result.codeToRewritePrefix).toContain('prefix-line\ncursor')
        expect(result.codeToRewriteSuffix).toContain('line\nsuffix-line')
        expect(result.range.start.line).toBe(9)
        expect(result.range.end.line).toBe(12)
    })

    it('handles file shorter than requested ranges', () => {
        const { document, position } = documentAndPosition('line1\n█line2\nline3\n')

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
        })

        const options: CurrentFilePromptOptions = {
            docContext,
            document,
            position,
            tokenBudget: {
                maxPrefixLinesInArea: 5, // Larger than file
                maxSuffixLinesInArea: 5, // Larger than file
                codeToRewritePrefixLines: 3, // Larger than file
                codeToRewriteSuffixLines: 3, // Larger than file
                prefixTokens: 100,
                suffixTokens: 100,
            },
        }

        const result = getCodeToReplaceData(options)

        expect(result.codeToRewrite).toBe('line1\nline2\nline3\n')
        expect(result.codeToRewritePrefix).toBe('line1\n')
        expect(result.codeToRewriteSuffix).toBe('line2\nline3\n')
        expect(result.prefixInArea).toBe('')
        expect(result.suffixInArea).toBe('')
        expect(result.prefixBeforeArea).toBe('')
        expect(result.suffixAfterArea).toBe('')
        expect(result.range.start.line).toBe(0)
        expect(result.range.end.line).toBe(3)
    })
})
