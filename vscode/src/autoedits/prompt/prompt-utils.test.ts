import dedent from 'dedent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { NotebookCellKind } from 'vscode-languageserver-protocol'

import { type AutocompleteContextSnippet, ps, testFileUri } from '@sourcegraph/cody-shared'

import { RetrieverIdentifier } from '../../completions/context/utils'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition, mockNotebookAndPosition } from '../../completions/test-helpers'
import {
    type CurrentFilePromptOptions,
    getCompletionsPromptWithSystemPrompt,
    getContextItemsInTokenBudget,
    getContextPromptWithPath,
    getCurrentFileContext,
    getCurrentFilePromptComponents,
    getJaccardSimilarityPrompt,
    getLintErrorsPrompt,
    getRecentCopyPrompt,
    getRecentEditsContextPromptWithPath,
    getRecentEditsPrompt,
    getRecentlyViewedSnippetsPrompt,
    joinPromptsWithNewlineSeparator,
} from './prompt-utils'

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

describe('getContextPromptWithPath', () => {
    it('correct prompt with path', () => {
        const filePath = ps`/path/to/file.js`
        const content = ps`const foo = 1`
        const prompt = getContextPromptWithPath(filePath, content)
        expect(prompt.toString()).toBe(dedent`
            (\`/path/to/file.js\`)

            const foo = 1
        `)
    })
})

describe('getRecentEditsContextPromptWithPath', () => {
    it('correct prompt with path', () => {
        const filePath = ps`/path/to/file.js`
        const content = ps`const foo = 1`
        const prompt = getRecentEditsContextPromptWithPath(filePath, content)
        expect(prompt.toString()).toBe(dedent`
            /path/to/file.js
            const foo = 1
        `)
    })
})

describe('getCurrentFilePromptComponents', () => {
    it('handles the markers correctly for current file context', () => {
        // Create a large file content
        const longPrefix = Array(10).fill('prefix-line').join('\n')
        const longSuffix = Array(10).fill('suffix-line').join('\n')
        const content = `${longPrefix}\ncursor█line\n${longSuffix}`

        const { document, position } = documentAndPosition(content)
        const maxPrefixLength = 100
        const maxSuffixLength = 100

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength,
            maxSuffixLength,
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
            },
        }

        const result = getCurrentFilePromptComponents(options)
        expect(result.fileWithMarkerPrompt.toString()).toBe(dedent`
            (\`test.ts\`)
            <file>
            prefix-line
            prefix-line
            prefix-line
            prefix-line
            prefix-line
            prefix-line

            <<<AREA_AROUND_CODE_TO_REWRITE_WILL_BE_INSERTED_HERE>>>
            suffix-line
            suffix-line
            suffix-line
            suffix-line
            suffix-line
            suffix-line

            </file>
        `)
        expect(result.areaPrompt.toString()).toBe(dedent`
            <area_around_code_to_rewrite>
            prefix-line

            <code_to_rewrite>
            prefix-line
            cursorline
            suffix-line

            </code_to_rewrite>
            suffix-line

            </area_around_code_to_rewrite>
        `)
    })

    it('handles the markers correctly for all content under area prompt', () => {
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
            },
        }

        const result = getCurrentFilePromptComponents(options)
        expect(result.fileWithMarkerPrompt.toString()).toBe(dedent`
            (\`test.ts\`)
            <file>

            <<<AREA_AROUND_CODE_TO_REWRITE_WILL_BE_INSERTED_HERE>>>

            </file>
        `)
        expect(result.areaPrompt.toString()).toBe(dedent`
            <area_around_code_to_rewrite>
            prefix-line

            <code_to_rewrite>
            prefix-line
            cursorline
            suffix-line

            </code_to_rewrite>
            suffix-line

            </area_around_code_to_rewrite>
        `)
    })
})

describe('getCurrentFileContext', () => {
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
            },
        }

        const result = getCurrentFileContext(options)

        // Verify the results
        expect(result.codeToRewrite.toString()).toBe('console.log("cell1 code")')
        expect(result.codeToRewritePrefix.toString()).toBe('console.log("cell1')
        expect(result.codeToRewriteSuffix.toString()).toBe(' code")')
        expect(result.prefixInArea.toString()).toBe('')
        expect(result.suffixInArea.toString()).toBe('')
        expect(result.prefixBeforeArea.toString()).toBe('console.log("cell0 code")\n')
        expect(result.suffixAfterArea.toString()).toBe('\nconsole.log("cell2 code")')
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
            },
        }

        const result = getCurrentFileContext(options)

        // Verify the results
        expect(result.codeToRewrite.toString()).toBe('console.log("cell1 code")')
        expect(result.codeToRewritePrefix.toString()).toBe('console.log("cell1')
        expect(result.codeToRewriteSuffix.toString()).toBe(' code")')
        expect(result.prefixInArea.toString()).toBe('')
        expect(result.suffixInArea.toString()).toBe('')
        expect(result.prefixBeforeArea.toString()).toBe('console.log("cell0 code")\n')
        expect(result.suffixAfterArea.toString()).toBe(
            '\n# # This is a markdown cell\n\nconsole.log("cell2 code")'
        )
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
            },
        }

        const result = getCurrentFileContext(options)

        // Verify the results
        expect(result.codeToRewrite.toString()).toBe('line2\nline3line4\nline5\n')
        expect(result.codeToRewritePrefix.toString()).toBe('line2\nline3')
        expect(result.codeToRewriteSuffix.toString()).toBe('line4\nline5\n')
        expect(result.prefixInArea.toString()).toBe('line1\n')
        expect(result.suffixInArea.toString()).toBe('line6')
        expect(result.prefixBeforeArea.toString()).toBe('')
        expect(result.suffixAfterArea.toString()).toBe('')
        expect(result.range.start.line).toBe(1)
        expect(result.range.end.line).toBe(3)
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
            },
        }

        const result = getCurrentFileContext(options)

        expect(result.codeToRewritePrefix.toString()).toBe('line2\n')
        expect(result.codeToRewriteSuffix.toString()).toBe('line3\nline4\n')
        expect(result.prefixInArea.toString()).toBe('line1\n')
        expect(result.suffixInArea.toString()).toBe('line5')
        expect(result.range.start.line).toBe(1)
        expect(result.range.end.line).toBe(3)
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
            },
        }

        const result = getCurrentFileContext(options)

        expect(result.codeToRewrite.toString()).toBe('const foo = bar')
        expect(result.codeToRewritePrefix.toString()).toBe('const foo = ')
        expect(result.codeToRewriteSuffix.toString()).toBe('bar')
        expect(result.prefixInArea.toString()).toBe('')
        expect(result.suffixInArea.toString()).toBe('')
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
            },
        }

        const result = getCurrentFileContext(options)

        expect(result.codeToRewrite.toString()).toBe('line1\nline2\n')
        expect(result.codeToRewritePrefix.toString()).toBe('')
        expect(result.codeToRewriteSuffix.toString()).toBe('line1\nline2\n')
        expect(result.prefixInArea.toString()).toBe('')
        expect(result.suffixInArea.toString()).toBe('line3')
        expect(result.range.start.line).toBe(0)
        expect(result.range.end.line).toBe(1)
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
            },
        }

        const result = getCurrentFileContext(options)

        expect(result.codeToRewrite.toString()).toBe('line2\nline3')
        expect(result.codeToRewritePrefix.toString()).toBe('line2\nline3')
        expect(result.codeToRewriteSuffix.toString()).toBe('')
        expect(result.prefixInArea.toString()).toBe('line1\n')
        expect(result.suffixInArea.toString()).toBe('')
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
            },
        }

        const result = getCurrentFileContext(options)

        expect(result.codeToRewrite.toString()).toBe('line3\nline4\nline5\nline6\nline7')
        expect(result.codeToRewritePrefix.toString()).toBe('line3\nline4\nline5\n')
        expect(result.codeToRewriteSuffix.toString()).toBe('line6\nline7')
        expect(result.prefixInArea.toString()).toBe('line2\n')
        expect(result.suffixInArea.toString()).toBe('')
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
            },
        }

        const result = getCurrentFileContext(options)

        // Verify truncation behavior
        expect(result.prefixBeforeArea.toString()).toBe('')
        expect(result.suffixAfterArea.toString()).toBe('')
        expect(result.codeToRewrite.toString()).toContain('prefix-line\ncursorline\nsuffix-line\n')
        expect(result.codeToRewritePrefix.toString()).toContain('prefix-line\ncursor')
        expect(result.codeToRewriteSuffix.toString()).toContain('line\nsuffix-line\n')
        expect(result.range.start.line).toBe(9)
        expect(result.range.end.line).toBe(11)
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
            },
        }

        const result = getCurrentFileContext(options)

        // Verify truncation behavior
        expect(result.prefixBeforeArea.toString()).toBe('')
        expect(result.suffixAfterArea.toString()).toBe('')
        expect(result.codeToRewrite.toString()).toContain('prefix-line\ncursorline\nsuffix-line')
        expect(result.codeToRewritePrefix.toString()).toContain('prefix-line\ncursor')
        expect(result.codeToRewriteSuffix.toString()).toContain('line\nsuffix-line')
        expect(result.range.start.line).toBe(9)
        expect(result.range.end.line).toBe(11)
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
            },
        }

        const result = getCurrentFileContext(options)

        expect(result.codeToRewrite.toString()).toBe('line1\nline2\nline3\n')
        expect(result.codeToRewritePrefix.toString()).toBe('line1\n')
        expect(result.codeToRewriteSuffix.toString()).toBe('line2\nline3\n')
        expect(result.prefixInArea.toString()).toBe('')
        expect(result.suffixInArea.toString()).toBe('')
        expect(result.prefixBeforeArea.toString()).toBe('')
        expect(result.suffixAfterArea.toString()).toBe('')
        expect(result.range.start.line).toBe(0)
        expect(result.range.end.line).toBe(2)
    })
})

describe('getContextItemsInTokenBudget', () => {
    const getContextItem = (content: string, identifier: string): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri('foo.ts'),
        startLine: 0,
        endLine: 0,
    })

    it('returns all items when total content length is under chars budget', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('short content 1', 'test1'),
            getContextItem('short content 2', 'test2'),
        ]
        const tokenBudget = 100
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result).toEqual(contextItems)
    })

    it('excludes items when total content length exceeds chars budget', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('a'.repeat(50), 'test1'),
            getContextItem('b'.repeat(60), 'test2'),
            getContextItem('c'.repeat(70), 'test3'),
        ]
        const tokenBudget = 20 // Set a token budget that results in a chars budget less than total content length
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result.length).toBe(1)
        expect(result[0].identifier).toBe('test1')
    })

    it('returns empty array when token budget is zero', () => {
        const contextItems: AutocompleteContextSnippet[] = [getContextItem('content', 'test1')]
        const tokenBudget = 0
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result).toEqual([])
    })

    it('returns empty array when contextItems is empty', () => {
        const contextItems: AutocompleteContextSnippet[] = []
        const tokenBudget = 100
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result).toEqual([])
    })

    it('skips items that individually exceed the chars budget', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('short content', 'test1'),
            getContextItem('very long content that exceeds the budget limit', 'test2'),
            getContextItem('another short content', 'test3'),
        ]
        const tokenBudget = 10
        const result = getContextItemsInTokenBudget(contextItems, tokenBudget)
        expect(result.length).toBe(2)
        expect(result[0].identifier).toBe('test1')
        expect(result[1].identifier).toBe('test3')
    })
})

describe('getCompletionsPromptWithSystemPrompt', () => {
    it('creates a prompt in the correct format', () => {
        const systemPrompt = ps`System prompt`
        const userPrompt = ps`User prompt`
        const expectedPrompt = 'System prompt\n\nUser: User prompt\n\nAssistant:'
        const result = getCompletionsPromptWithSystemPrompt(systemPrompt, userPrompt)
        expect(result.toString()).toEqual(expectedPrompt)
    })
})

describe('getLintErrorsPrompt', () => {
    const getContextItem = (
        content: string,
        identifier: string,
        fileName = 'foo.ts'
    ): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri(fileName),
        startLine: 0,
        endLine: 0,
    })

    it('filters only the context items from the diagnostics context sources', () => {
        const contextItems = [
            getContextItem('foo\nErr | Defined foo', RetrieverIdentifier.DiagnosticsRetriever),
            getContextItem('bar\nErr | Defined bar', RetrieverIdentifier.DiagnosticsRetriever),
            getContextItem('baz', RetrieverIdentifier.RecentCopyRetriever),
            getContextItem('qux', RetrieverIdentifier.RecentViewPortRetriever),
        ]
        const prompt = getLintErrorsPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <lint_errors>
            (\`foo.ts\`)

            foo
            Err | Defined foo

            bar
            Err | Defined bar
            </lint_errors>
        `)
    })

    it('returns empty prompt for no diagnostics error', () => {
        const contextItems: AutocompleteContextSnippet[] = []
        const prompt = getLintErrorsPrompt(contextItems)
        expect(prompt.toString()).toBe('')
    })

    it('diagnostics errors from multiple files', () => {
        const contextItems: AutocompleteContextSnippet[] = [
            getContextItem('foo\nErr | Defined foo', RetrieverIdentifier.DiagnosticsRetriever, 'foo.ts'),
            getContextItem(
                'another foo\nErr | Defined another foo',
                RetrieverIdentifier.DiagnosticsRetriever,
                'foo.ts'
            ),
            getContextItem('bar\nErr | Defined bar', RetrieverIdentifier.DiagnosticsRetriever, 'bar.ts'),
            getContextItem(
                'another bar\nErr | Defined another bar',
                RetrieverIdentifier.DiagnosticsRetriever,
                'bar.ts'
            ),
        ]
        const prompt = getLintErrorsPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <lint_errors>
            (\`foo.ts\`)

            foo
            Err | Defined foo

            another foo
            Err | Defined another foo

            (\`bar.ts\`)

            bar
            Err | Defined bar

            another bar
            Err | Defined another bar
            </lint_errors>
        `)
    })
})

describe('getRecentCopyPrompt', () => {
    const getContextItem = (
        content: string,
        identifier: string,
        fileName = 'foo.ts'
    ): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri(fileName),
        startLine: 0,
        endLine: 0,
    })

    it('filters only the context items from the recent copy context sources', () => {
        const contextItems = [
            getContextItem('foo\nErr | Defined foo', RetrieverIdentifier.DiagnosticsRetriever),
            getContextItem('bar\nErr | Defined bar', RetrieverIdentifier.DiagnosticsRetriever),
            getContextItem('baz', RetrieverIdentifier.RecentCopyRetriever),
            getContextItem('qux', RetrieverIdentifier.RecentViewPortRetriever),
        ]
        const prompt = getRecentCopyPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <recent_copy>
            (\`foo.ts\`)

            baz
            </recent_copy>
        `)
    })

    it('empty prompt if no recent copy context', () => {
        const contextItems = [
            getContextItem('foo\nErr | Defined foo', RetrieverIdentifier.DiagnosticsRetriever),
        ]
        const prompt = getRecentCopyPrompt(contextItems)
        expect(prompt.toString()).toBe('')
    })

    it('recent copy context items from multiple sources', () => {
        const contextItems = [
            getContextItem('foo copy content', RetrieverIdentifier.RecentCopyRetriever, 'foo.ts'),
            getContextItem('bar copy content', RetrieverIdentifier.RecentCopyRetriever, 'bar.ts'),
        ]
        const prompt = getRecentCopyPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <recent_copy>
            (\`foo.ts\`)

            foo copy content

            (\`bar.ts\`)

            bar copy content
            </recent_copy>
        `)
    })
})

describe('getRecentEditsPrompt', () => {
    const getContextItem = (
        content: string,
        identifier: string,
        fileName = 'foo.ts'
    ): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri(fileName),
        startLine: 0,
        endLine: 0,
    })

    it('filters only the context items from the recent edits context sources', () => {
        const contextItems = [
            getContextItem('1-|const =\n1+|const i = 5', RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('1-|let z =\n1+|let z = x + y', RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('baz', RetrieverIdentifier.RecentViewPortRetriever),
            getContextItem('qux', RetrieverIdentifier.RecentViewPortRetriever),
        ]
        const prompt = getRecentEditsPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <diff_history>
            foo.ts
            1-|let z =
            1+|let z = x + y
            foo.ts
            1-|const =
            1+|const i = 5
            </diff_history>
        `)
    })

    it('empty prompt on no context items', () => {
        const contextItems: AutocompleteContextSnippet[] = []
        const prompt = getRecentEditsPrompt(contextItems)
        expect(prompt.toString()).toBe('')
    })

    it('Recent edits from multiple files in the correct order', () => {
        const contextItems = [
            getContextItem(
                '1-|const =\n1+|const i = 5',
                RetrieverIdentifier.RecentEditsRetriever,
                'foo.ts'
            ),
            getContextItem(
                '1-|let z =\n1+|let z = x + y',
                RetrieverIdentifier.RecentEditsRetriever,
                'bar.ts'
            ),
            getContextItem(
                '5-|function test() {}\n5+|function test() { return true; }',
                RetrieverIdentifier.RecentEditsRetriever,
                'baz.ts'
            ),
            getContextItem(
                '5-|const value = null\n5+|const value = "test"',
                RetrieverIdentifier.RecentEditsRetriever,
                'qux.ts'
            ),
        ]
        const prompt = getRecentEditsPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <diff_history>
            qux.ts
            5-|const value = null
            5+|const value = "test"
            baz.ts
            5-|function test() {}
            5+|function test() { return true; }
            bar.ts
            1-|let z =
            1+|let z = x + y
            foo.ts
            1-|const =
            1+|const i = 5
            </diff_history>
        `)
    })
})

describe('getRecentlyViewedSnippetsPrompt', () => {
    const getContextItem = (
        content: string,
        identifier: string,
        fileName = 'foo.ts'
    ): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri(fileName),
        startLine: 0,
        endLine: 0,
    })

    it('filters only the context items from the recent snippet views context sources', () => {
        const contextItems = [
            getContextItem('foo', RetrieverIdentifier.RecentViewPortRetriever),
            getContextItem('bar', RetrieverIdentifier.RecentViewPortRetriever),
            getContextItem('baz', RetrieverIdentifier.DiagnosticsRetriever),
            getContextItem('qux', RetrieverIdentifier.RecentCopyRetriever),
        ]
        const prompt = getRecentlyViewedSnippetsPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <recently_viewed_snippets>
            <snippet>
            (\`foo.ts\`)

            bar
            </snippet>
            <snippet>
            (\`foo.ts\`)

            foo
            </snippet>
            </recently_viewed_snippets>
        `)
    })

    it('empty prompt on no context items', () => {
        const contextItems: AutocompleteContextSnippet[] = []
        const prompt = getRecentlyViewedSnippetsPrompt(contextItems)
        expect(prompt.toString()).toBe('')
    })

    it('Recent views from multiple files in the correct order', () => {
        const contextItems = [
            getContextItem('foo', RetrieverIdentifier.RecentViewPortRetriever, 'foo.ts'),
            getContextItem('bar', RetrieverIdentifier.RecentViewPortRetriever, 'bar.ts'),
            getContextItem('bax', RetrieverIdentifier.RecentViewPortRetriever, 'baz.ts'),
            getContextItem('qux', RetrieverIdentifier.RecentViewPortRetriever, 'qux.ts'),
        ]
        const prompt = getRecentlyViewedSnippetsPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <recently_viewed_snippets>
            <snippet>
            (\`qux.ts\`)

            qux
            </snippet>
            <snippet>
            (\`baz.ts\`)

            bax
            </snippet>
            <snippet>
            (\`bar.ts\`)

            bar
            </snippet>
            <snippet>
            (\`foo.ts\`)

            foo
            </snippet>
            </recently_viewed_snippets>
        `)
    })
})

describe('getJaccardSimilarityPrompt', () => {
    const getContextItem = (
        content: string,
        identifier: string,
        fileName = 'foo.ts'
    ): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri(fileName),
        startLine: 0,
        endLine: 0,
    })

    it('filters only the context items from the jaccard similarity context sources', () => {
        const contextItems = [
            getContextItem('foo', RetrieverIdentifier.JaccardSimilarityRetriever),
            getContextItem('bar', RetrieverIdentifier.JaccardSimilarityRetriever),
            getContextItem('baz', RetrieverIdentifier.DiagnosticsRetriever),
            getContextItem('qux', RetrieverIdentifier.RecentCopyRetriever),
        ]
        const prompt = getJaccardSimilarityPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <extracted_code_snippets>
            <snippet>
            (\`foo.ts\`)

            foo
            </snippet>
            <snippet>
            (\`foo.ts\`)

            bar
            </snippet>
            </extracted_code_snippets>
        `)
    })

    it('empty prompt on no context items', () => {
        const contextItems: AutocompleteContextSnippet[] = []
        const prompt = getJaccardSimilarityPrompt(contextItems)
        expect(prompt.toString()).toBe('')
    })

    it('jaccard similarity from multiple files in the correct order', () => {
        const contextItems = [
            getContextItem('foo', RetrieverIdentifier.JaccardSimilarityRetriever, 'foo.ts'),
            getContextItem('bar', RetrieverIdentifier.JaccardSimilarityRetriever, 'bar.ts'),
            getContextItem('bax', RetrieverIdentifier.JaccardSimilarityRetriever, 'baz.ts'),
            getContextItem('qux', RetrieverIdentifier.JaccardSimilarityRetriever, 'qux.ts'),
        ]
        const prompt = getJaccardSimilarityPrompt(contextItems)
        expect(prompt.toString()).toBe(dedent`
            <extracted_code_snippets>
            <snippet>
            (\`foo.ts\`)

            foo
            </snippet>
            <snippet>
            (\`bar.ts\`)

            bar
            </snippet>
            <snippet>
            (\`baz.ts\`)

            bax
            </snippet>
            <snippet>
            (\`qux.ts\`)

            qux
            </snippet>
            </extracted_code_snippets>
        `)
    })
})

describe('joinPromptsWithNewlineSeparator', () => {
    it('joins multiple prompt strings with a new line separator', () => {
        const prompt = joinPromptsWithNewlineSeparator(ps`foo`, ps`bar`)
        expect(prompt.toString()).toBe(dedent`
            foo
            bar
        `)
    })
})
