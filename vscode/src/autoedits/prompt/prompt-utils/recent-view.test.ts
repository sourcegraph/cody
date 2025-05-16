import { type AutocompleteContextSnippet, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { RetrieverIdentifier } from '../../../completions/context/utils'
import {
    getRecentSnippetViewPromptWithMaxSnippetAge,
    getRecentlyViewedSnippetsPrompt,
} from './recent-view'

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

describe('getRecentSnippetViewPromptWithMaxSnippetAge', () => {
    const getContextItem = (
        content: string,
        identifier: string,
        fileName = 'foo.ts',
        timeSinceActionMs?: number
    ): AutocompleteContextSnippet => ({
        type: 'file',
        content,
        identifier,
        uri: testFileUri(fileName),
        startLine: 0,
        endLine: 0,
        metadata: timeSinceActionMs !== undefined ? { timeSinceActionMs } : undefined,
    })

    it('filters snippets based on maxAgeContextMs', () => {
        const maxAgeContextMs = 1000
        const contextItems = [
            getContextItem('fresh', RetrieverIdentifier.RecentViewPortRetriever, 'fresh.ts', 500),
            getContextItem('stale', RetrieverIdentifier.RecentViewPortRetriever, 'stale.ts', 1500),
            getContextItem(
                'another-fresh',
                RetrieverIdentifier.RecentViewPortRetriever,
                'another.ts',
                999
            ),
            getContextItem('no-time', RetrieverIdentifier.RecentViewPortRetriever, 'notime.ts'),
            getContextItem('wrong-type', RetrieverIdentifier.DiagnosticsRetriever, 'wrong.ts', 100),
        ]

        const prompt = getRecentSnippetViewPromptWithMaxSnippetAge(contextItems, maxAgeContextMs)

        // Should only include 'fresh' and 'another-fresh' in the snippets section
        expect(prompt.toString()).toContain('fresh')
        expect(prompt.toString()).toContain('another-fresh')
        expect(prompt.toString()).not.toContain('stale')
        expect(prompt.toString()).not.toContain('no-time')
        expect(prompt.toString()).not.toContain('wrong-type')
    })

    it('returns only instructions when no snippets match the time criteria', () => {
        const maxAgeContextMs = 500
        const contextItems = [
            getContextItem('stale1', RetrieverIdentifier.RecentViewPortRetriever, 'stale1.ts', 600),
            getContextItem('stale2', RetrieverIdentifier.RecentViewPortRetriever, 'stale2.ts', 1000),
            getContextItem('no-time', RetrieverIdentifier.RecentViewPortRetriever, 'notime.ts'),
        ]

        const prompt = getRecentSnippetViewPromptWithMaxSnippetAge(contextItems, maxAgeContextMs)

        // Should not include any snippets
        expect(prompt.toString()).not.toContain('<snippet>')
        expect(prompt.toString()).not.toContain('stale1')
        expect(prompt.toString()).not.toContain('stale2')
        expect(prompt.toString()).not.toContain('no-time')
        // But should still include instructions
        expect(prompt.toString()).not.toBe('')
    })
})
