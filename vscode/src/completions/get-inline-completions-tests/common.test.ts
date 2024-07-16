import dedent from 'dedent'
import { describe, expect, test } from 'vitest'

import type { CompletionParameters } from '@sourcegraph/cody-shared'

import { vsCodeMocks } from '../../testutils/mocks'
import { InlineCompletionsResultSource } from '../get-inline-completions'
import { RequestManager } from '../request-manager'
import { completion } from '../test-helpers'

import { type V, getInlineCompletions, getInlineCompletionsFullResponse, params } from './helpers'

describe('[getInlineCompletions] common', () => {
    test('single-line mode only completes one line', async () => {
        const result = await getInlineCompletions(
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

        expect(result!.items[0].insertText).toEqual('if (true) {')
        expect(result!.source).toEqual(InlineCompletionsResultSource.Network)
    })

    test('with selectedCompletionInfo', async () =>
        expect(
            await getInlineCompletions(
                params('array.so█', [completion`rt()`], {
                    selectedCompletionInfo: { text: 'sort', range: new vsCodeMocks.Range(0, 6, 0, 8) },
                })
            )
        ).toEqual<V>({
            items: [{ insertText: 'rt()' }],
            source: InlineCompletionsResultSource.Network,
        }))

    test('emits a completion even when the abort signal was triggered after a network fetch ', async () => {
        const abortController = new AbortController()
        expect(
            await getInlineCompletions({
                ...params('const x = █', [completion`├1337┤`], {
                    onNetworkRequest: () => abortController.abort(),
                }),
                abortSignal: abortController.signal,
            })
        ).toEqual<V>({
            items: [{ insertText: '1337' }],
            source: InlineCompletionsResultSource.Network,
        })
    })

    test('trims whitespace in the prefix but keeps one \n', async () => {
        const requests: CompletionParameters[] = []
        await getInlineCompletions(
            params(
                dedent`
            class Range {


                █
            }
        `,
                [],
                {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                }
            )
        )
        const messages = requests[0].messages
        expect(messages.at(-1)!.text?.toString()).toBe('<CODE5711>class Range {')
    })

    test('uses a more complex prompt for larger files', async () => {
        const requests: CompletionParameters[] = []
        await getInlineCompletions(
            params(
                dedent`
            class Range {
                public startLine: number
                public startCharacter: number
                public endLine: number
                public endCharacter: number
                public start: Position
                public end: Position

                constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
                    this.startLine = █
                    this.startCharacter = startCharacter
                    this.endLine = endLine
                    this.endCharacter = endCharacter
                    this.start = new Position(startLine, startCharacter)
                    this.end = new Position(endLine, endCharacter)
                }
            }
        `,
                [],
                {
                    onNetworkRequest(request) {
                        requests.push(request)
                    },
                }
            )
        )
        expect(requests).toHaveLength(1)
        const messages = requests[0].messages
        expect(messages.at(-1)).toMatchInlineSnapshot(`
            {
              "speaker": "assistant",
              "text": "<CODE5711>constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
                    this.startLine =",
            }
        `)
        expect(requests).toBeSingleLine()
    })

    test('synthesizes a completion from a prior request', async () => {
        // Reuse the same request manager for both requests in this test
        const requestManager = new RequestManager()

        const promise1 = getInlineCompletionsFullResponse(
            params('console.█', [completion`log('Hello, world!');`], { requestManager })
        )

        // Start a second completions query before the first one is finished. The second one never
        // receives a network response
        const promise2 = getInlineCompletionsFullResponse(
            params('console.log(█', 'never-resolve', { requestManager })
        )

        const firstCompletions = await promise1
        const secondCompletions = await promise2

        expect(secondCompletions?.items[0].insertText).toBe("'Hello, world!');")
        // The logId should match so this completion is not fired in duplicate analytic calls
        expect(secondCompletions?.logId).toBe(firstCompletions?.logId)
    })
})
