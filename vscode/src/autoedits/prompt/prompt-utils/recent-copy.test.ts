import { type AutocompleteContextSnippet, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { RetrieverIdentifier } from '../../../completions/context/utils'
import { getRecentCopyPrompt } from './recent-copy'

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
