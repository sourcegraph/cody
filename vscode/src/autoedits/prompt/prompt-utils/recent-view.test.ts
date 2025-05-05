import { type AutocompleteContextSnippet, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { RetrieverIdentifier } from '../../../completions/context/utils'
import { getRecentlyViewedSnippetsPrompt } from './recent-view'

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
