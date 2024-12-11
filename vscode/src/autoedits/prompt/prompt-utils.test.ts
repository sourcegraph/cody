import { ps, testFileUri } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import type { AutocompleteContextSnippet } from '../../../../lib/shared/src/completions/types'
import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import {
    getCompletionsPromptWithSystemPrompt,
    getContextItemsInTokenBudget,
    getCurrentFileContext,
} from '../prompt/prompt-utils'

describe('getCurrentFileContext', () => {
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
            maxPrefixLinesInArea: 1,
            maxSuffixLinesInArea: 1,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 1,
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

        const options = {
            docContext,
            document,
            position,
            maxPrefixLinesInArea: 1,
            maxSuffixLinesInArea: 1,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 1,
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

        const options = {
            docContext,
            document,
            position,
            maxPrefixLinesInArea: 1,
            maxSuffixLinesInArea: 1,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 1,
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

        const options = {
            docContext,
            document,
            position,
            maxPrefixLinesInArea: 1,
            maxSuffixLinesInArea: 1,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 1,
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

        const options = {
            docContext,
            document,
            position,
            maxPrefixLinesInArea: 1,
            maxSuffixLinesInArea: 1,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 1,
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

        const options = {
            docContext,
            document,
            position,
            maxPrefixLinesInArea: 1,
            maxSuffixLinesInArea: 1,
            codeToRewritePrefixLines: 3, // Increased prefix lines
            codeToRewriteSuffixLines: 1,
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

        const options = {
            docContext,
            document,
            position,
            maxPrefixLinesInArea: 1,
            maxSuffixLinesInArea: 1,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 1,
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

        const options = {
            docContext,
            document,
            position,
            maxPrefixLinesInArea: 2,
            maxSuffixLinesInArea: 2,
            codeToRewritePrefixLines: 2,
            codeToRewriteSuffixLines: 2,
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

        const options = {
            docContext,
            document,
            position,
            maxPrefixLinesInArea: 5, // Larger than file
            maxSuffixLinesInArea: 5, // Larger than file
            codeToRewritePrefixLines: 3, // Larger than file
            codeToRewriteSuffixLines: 3, // Larger than file
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