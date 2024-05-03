import { describe, expect, test } from 'vitest'

import type { CompletionParameters } from '@sourcegraph/cody-shared'

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
    })
})
