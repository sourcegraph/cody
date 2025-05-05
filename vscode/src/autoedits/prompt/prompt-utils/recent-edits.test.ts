import { type AutocompleteContextSnippet, ps, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { RetrieverIdentifier } from '../../../completions/context/utils'
import { getRecentEditsContextPromptWithPath, getRecentEditsPrompt } from './recent-edits'

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
