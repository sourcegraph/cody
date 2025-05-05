import { type AutocompleteContextSnippet, ps, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { RetrieverIdentifier } from '../../../completions/context/utils'
import { getRecentEditsContextPromptWithPath, getRecentEditsPrompt, groupConsecutiveRecentEditsItemsFromSameFile, splitMostRecentRecentEditItemAsShortTermItem } from './recent-edits'

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

describe('groupConsecutiveRecentEditsItemsFromSameFile', () => {
    const getContextItem = (
        content: string,
        uri: string
    ): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier: RetrieverIdentifier.RecentEditsRetriever,
        uri: testFileUri(uri),
        startLine: 0,
        endLine: 0,
    })

    it('returns empty array when input is empty', () => {
        const result = groupConsecutiveRecentEditsItemsFromSameFile([])
        expect(result).toEqual([])
    })

    it('groups consecutive items from the same file', () => {
        const contextItems = [
            getContextItem('edit1', 'file1.ts'),
            getContextItem('edit2', 'file1.ts'),
            getContextItem('edit3', 'file2.ts'),
            getContextItem('edit4', 'file3.ts'),
            getContextItem('edit5', 'file3.ts'),
            getContextItem('edit6', 'file3.ts'),
            getContextItem('edit7', 'file1.ts'),
        ]

        const result = groupConsecutiveRecentEditsItemsFromSameFile(contextItems)
        
        expect(result.length).toBe(4) // 4 groups
        expect(result[0].content).toBe('edit2\nthen\nedit1') // First group: file1.ts (edit1, edit2) - reversed
        expect(result[0].uri.toString()).toContain('file1.ts')
        
        expect(result[1].content).toBe('edit3') // Second group: file2.ts (edit3)
        expect(result[1].uri.toString()).toContain('file2.ts')
        
        expect(result[2].content).toBe('edit6\nthen\nedit5\nthen\nedit4') // Third group: file3.ts (edit4, edit5, edit6) - reversed
        expect(result[2].uri.toString()).toContain('file3.ts')
        
        expect(result[3].content).toBe('edit7') // Fourth group: file1.ts (edit7)
        expect(result[3].uri.toString()).toContain('file1.ts')
    })

    it('preserves original items when there are no consecutive items from the same file', () => {
        const contextItems = [
            getContextItem('edit1', 'file1.ts'),
            getContextItem('edit2', 'file2.ts'),
            getContextItem('edit3', 'file3.ts'),
        ]

        const result = groupConsecutiveRecentEditsItemsFromSameFile(contextItems)
        
        expect(result.length).toBe(3)
        expect(result[0].content).toBe('edit1')
        expect(result[1].content).toBe('edit2')
        expect(result[2].content).toBe('edit3')
    })
})

describe('splitMostRecentRecentEditItemAsShortTermItem', () => {
    const getContextItem = (
        content: string,
        identifier: string = RetrieverIdentifier.RecentEditsRetriever,
        fileName = 'foo.ts'
    ): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri(fileName),
        startLine: 0,
        endLine: 0,
    })

    it('splits the most recent edit item into short-term and long-term', () => {
        const contextItems = [
            getContextItem('edit1', RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('edit2', RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('edit3', RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('other', RetrieverIdentifier.RecentViewPortRetriever),
        ]

        const result = splitMostRecentRecentEditItemAsShortTermItem(contextItems)
        
        expect(result.shortTermEditItems.length).toBe(1)
        expect(result.shortTermEditItems[0].content).toBe('edit1')
        
        expect(result.longTermEditItems.length).toBe(2)
        expect(result.longTermEditItems[0].content).toBe('edit2')
        expect(result.longTermEditItems[1].content).toBe('edit3')
    })

    it('handles single edit item', () => {
        const contextItems = [
            getContextItem('edit1', RetrieverIdentifier.RecentEditsRetriever),
            getContextItem('other', RetrieverIdentifier.RecentViewPortRetriever),
        ]

        const result = splitMostRecentRecentEditItemAsShortTermItem(contextItems)
        
        expect(result.shortTermEditItems.length).toBe(1)
        expect(result.shortTermEditItems[0].content).toBe('edit1')
        expect(result.longTermEditItems.length).toBe(0)
    })

    it('handles no edit items', () => {
        const contextItems = [
            getContextItem('other1', RetrieverIdentifier.RecentViewPortRetriever),
            getContextItem('other2', RetrieverIdentifier.DiagnosticsRetriever),
        ]

        const result = splitMostRecentRecentEditItemAsShortTermItem(contextItems)
        
        expect(result.shortTermEditItems.length).toBe(0)
        expect(result.longTermEditItems.length).toBe(0)
    })
})
