import { type AutocompleteContextSnippet, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { RetrieverIdentifier } from '../../../completions/context/utils'
import { getJaccardSimilarityPrompt } from './jaccard-similarity'

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
