import { type AutocompleteContextSnippet, testFileUri } from '@sourcegraph/cody-shared'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { RetrieverIdentifier } from '../../../completions/context/utils'
import { getLintErrorsPrompt } from './lint'

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
