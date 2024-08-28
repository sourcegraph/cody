import { describe, expect, test } from 'vitest'

import { allTriggerKinds } from '../get-inline-completions'
import { getInlineCompletionsWithInlinedChunks } from './helpers'

describe('[getInlineCompletions] models', () => {
    test('manual invocation should use starcoder 16b', async () => {
        const requests: Record<string, string> = {}
        for (const triggerKind of allTriggerKinds()) {
            await getInlineCompletionsWithInlinedChunks('const greeting = "█"', {
                onNetworkRequest(request) {
                    if (request.model) {
                        requests[triggerKind] = request.model
                    }
                },
                triggerKind,
                configuration: {
                    autocompleteAdvancedProvider: 'fireworks',
                    autocompleteAdvancedModel: 'starcoder-hybrid',
                },
            })
        }
        expect(requests).toMatchInlineSnapshot(`
          {
            "Automatic": "fireworks/starcoder-7b",
            "Hover": "fireworks/starcoder-16b",
            "Manual": "fireworks/starcoder-16b",
            "SuggestWidget": "fireworks/starcoder-16b",
          }
        `)
    })
})
