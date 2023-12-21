import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { TriggerKind } from '../get-inline-completions'
import { completion } from '../test-helpers'

import { getInlineCompletions, params, V } from './helpers'

describe('[getInlineCompletions] no request when accepting', () => {
    // In VS Code, accepting a completion will immediately start a new completion request. If the
    // user, however, accepted a single line completion, chances are that the current line is
    // finished (ie. the LLM already gave the best guess at completing the line).
    //
    // Thus, this results in a request that almost always has zero results but still incurs network
    // and inference costs.
    it('should not make a request after accepting a completion', async () => {
        const initialRequestParams = params(
            dedent`
                function test() {
                    console.l█
                }
            `,
            [completion`├og = 123┤`]
        )
        const item = await getInlineCompletions(initialRequestParams)
        expect(
            await getInlineCompletions(
                params(
                    dedent`
                        function test() {
                            console.log = 123█
                        }
                    `,
                    [],
                    {
                        lastAcceptedCompletionItem: {
                            requestParams: initialRequestParams,
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            analyticsItem: item!.items[0]!,
                        },
                    }
                )
            )
        ).toEqual<V>(null)
    })

    it('should make the request when manually invoked', async () => {
        const initialRequestParams = params(
            dedent`
                function test() {
                    console.l█
                }
            `,
            [completion`├og = 123┤`]
        )
        const item = await getInlineCompletions(initialRequestParams)
        expect(
            await getInlineCompletions(
                params(
                    dedent`
                        function test() {
                            console.log = 123█
                        }
                    `,
                    [],
                    {
                        triggerKind: TriggerKind.Manual,
                        lastAcceptedCompletionItem: {
                            requestParams: initialRequestParams,
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            analyticsItem: item!.items[0]!,
                        },
                    }
                )
            )
        ).not.toEqual<V>(null)
    })

    it('should make the request when the accepted completion was multi-line', async () => {
        const initialRequestParams = params(
            dedent`
                function test() {
                    █
                }
            `,
            [completion`├console.log = 123┤`]
        )
        const item = await getInlineCompletions(initialRequestParams)
        expect(
            await getInlineCompletions(
                params(
                    dedent`
                        function test() {
                            console.log = 123█
                        }
                    `,
                    [],
                    {
                        lastAcceptedCompletionItem: {
                            requestParams: initialRequestParams,
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            analyticsItem: item!.items[0]!,
                        },
                    }
                )
            )
        ).not.toEqual<V>(null)
    })
})
