import { describe, expect, test } from 'vitest'

import type { CompletionParameters } from '@sourcegraph/cody-shared'
import { allTriggerKinds } from '../get-inline-completions'
import { getInlineCompletionsWithInlinedChunks } from './helpers'

describe('[getInlineCompletions] models', () => {
    describe('starcoder2-hybrid', () => {
        test('singleline', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletionsWithInlinedChunks('const value = █1█', {
                onNetworkRequest(request) {
                    requests.push(request)
                },
                configuration: {
                    autocompleteAdvancedProvider: 'fireworks',
                    autocompleteAdvancedModel: 'starcoder2-hybrid',
                },
            })
            expect(requests[0].stopSequences).toMatchInlineSnapshot(`
              [
                "

              ",
                "

              ",
                "<fim_prefix>",
                "<fim_suffix>",
                "<fim_middle>",
                "<|endoftext|>",
                "<file_sep>",
              ]
            `)
            expect(requests[0].model).toBe('fireworks/starcoder2-7b')

            await getInlineCompletionsWithInlinedChunks('const value = █1█', {
                onNetworkRequest(request) {
                    requests.push(request)
                },
                configuration: {
                    autocompleteAdvancedProvider: 'fireworks',
                    autocompleteAdvancedModel: 'starcoder2-hybrid',
                },
            })

            // Keeps stop sequences array unchanged
            expect(requests[0].stopSequences).toMatchInlineSnapshot(`
              [
                "

              ",
                "

              ",
                "<fim_prefix>",
                "<fim_suffix>",
                "<fim_middle>",
                "<|endoftext|>",
                "<file_sep>",
              ]
            `)
        })

        test('multiline', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletionsWithInlinedChunks('const value = {█}█', {
                onNetworkRequest(request) {
                    requests.push(request)
                },
                configuration: {
                    autocompleteAdvancedProvider: 'fireworks',
                    autocompleteAdvancedModel: 'starcoder2-hybrid',
                },
            })
            expect(requests[0].stopSequences).toMatchInlineSnapshot(`
              [
                "

              ",
                "

              ",
                "<fim_prefix>",
                "<fim_suffix>",
                "<fim_middle>",
                "<|endoftext|>",
                "<file_sep>",
              ]
            `)
            expect(requests[0].model).toBe('fireworks/starcoder2-15b')
        })

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
})
