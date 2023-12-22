import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { TriggerKind } from '../get-inline-completions'
import { completion } from '../test-helpers'

import { getInlineCompletions, params, V } from './helpers'

// Simulate the VS Code behavior where accepting a completion will immediately start a new
// completion request.
async function getInlineCompletionAfterAccepting(
    initialCode: string,
    completion: CompletionResponse,
    acceptedCode: string,
    triggerKind: TriggerKind = TriggerKind.Automatic
): ReturnType<typeof getInlineCompletions> {
    const initialRequestParams = params(initialCode, [completion])
    const item = await getInlineCompletions(initialRequestParams)

    return getInlineCompletions(
        params(acceptedCode, [], {
            triggerKind,
            lastAcceptedCompletionItem: {
                requestParams: initialRequestParams,
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                analyticsItem: item!.items[0]!,
            },
        })
    )
}

describe('[getInlineCompletions] no request when accepting', () => {
    // In VS Code, accepting a completion will immediately start a new completion request. If the
    // user, however, accepted a single line completion, chances are that the current line is
    // finished (ie. the LLM already gave the best guess at completing the line).
    //
    // Thus, this results in a request that almost always has zero results but still incurs network
    // and inference costs.
    it('should not make a request after accepting a completion', async () =>
        expect(
            await getInlineCompletionAfterAccepting(
                dedent`
                    function test() {
                        console.l█
                    }
                `,
                completion`├og = 123┤`,
                dedent`
                    function test() {
                        console.log = 123█
                    }
                `
            )
        ).toEqual<V>(null))

    it('should make the request when manually invoked', async () =>
        expect(
            await getInlineCompletionAfterAccepting(
                dedent`
                    function test() {
                        console.l█
                    }
                `,
                completion`├og = 123┤`,
                dedent`
                    function test() {
                        console.log = 123█
                    }
                `,
                TriggerKind.Manual
            )
        ).not.toEqual<V>(null))

    it('should make the request when the accepted completion was multi-line', async () =>
        expect(
            await getInlineCompletionAfterAccepting(
                dedent`
                function test() {
                    █
                }
            `,
                completion`├console.log = 123┤`,
                dedent`
                function test() {
                    console.log = 123█
                }
            `,
                TriggerKind.Manual
            )
        ).not.toEqual<V>(null))
})
