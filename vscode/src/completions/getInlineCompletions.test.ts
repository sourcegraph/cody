import { describe, expect, test } from 'vitest'

import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { vsCodeMocks } from '../testutils/mocks'
import { range } from '../testutils/textDocument'

import { getInlineCompletions, InlineCompletionsParams, InlineCompletionsResultSource } from './getInlineCompletions'
import { createProviderConfig } from './providers/anthropic'
import { RequestManager } from './request-manager'
import { completion, documentAndPosition } from './testHelpers'

function params(
    code: string,
    responses: CompletionResponse[],
    {
        languageId = 'typescript',
        context = {
            triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
            selectedCompletionInfo: undefined,
        },
        ...params
    }: Partial<Omit<InlineCompletionsParams, 'document' | 'position'>> & { languageId?: string } = {}
): InlineCompletionsParams {
    const requests: CompletionParameters[] = []
    let requestCounter = 0
    const completionsClient: Pick<SourcegraphCompletionsClient, 'complete'> = {
        complete(params: CompletionParameters): Promise<CompletionResponse> {
            requests.push(params)
            return Promise.resolve(responses?.[requestCounter++] || { completion: '', stopReason: 'unknown' })
        },
    }
    const providerConfig = createProviderConfig({
        completionsClient,
        contextWindowTokens: 2048,
    })

    const { document, position } = documentAndPosition(code, languageId)

    return {
        document,
        position,
        context,
        promptChars: 1000,
        maxPrefixChars: 1000,
        maxSuffixChars: 1000,
        providerConfig,
        responsePercentage: 0.4,
        prefixPercentage: 0.3,
        suffixPercentage: 0.3,
        toWorkspaceRelativePath: () => 'test.ts',
        requestManager: new RequestManager(),
        ...params,
    }
}

type V = Awaited<ReturnType<typeof getInlineCompletions>>

describe('getInlineCompletions', () => {
    test('after whitespace', async () =>
        expect(await getInlineCompletions(params('foo = █', [completion`bar`]))).toEqual<V>({
            items: [{ insertText: 'bar' }],
            source: InlineCompletionsResultSource.Network,
        }))

    test('end of word', async () =>
        expect(await getInlineCompletions(params('foo█', [completion`()`]))).toEqual<V>({
            items: [{ insertText: '()' }],
            source: InlineCompletionsResultSource.Network,
        }))

    test('middle of line', async () =>
        expect(
            await getInlineCompletions(params('function bubbleSort(█)', [completion`array) {`, completion`items) {`]))
        ).toEqual<V>({
            items: [
                { insertText: 'array) {', range: range(0, 20, 0, 21) },
                { insertText: 'items) {', range: range(0, 20, 0, 21) },
            ],
            source: InlineCompletionsResultSource.Network,
        }))

    test('single-line mode only completes one line', async () =>
        expect(
            await getInlineCompletions(
                params(
                    `
        function test() {
            console.log(1);
            █
        }
        `,
                    [
                        completion`
                    ├if (true) {
                        console.log(3);
                    }
                    console.log(4);┤
                ┴┴┴┴`,
                    ]
                )
            )
        ).toEqual<V>({
            items: [{ insertText: 'if (true) {' }],
            source: InlineCompletionsResultSource.Network,
        }))
})
