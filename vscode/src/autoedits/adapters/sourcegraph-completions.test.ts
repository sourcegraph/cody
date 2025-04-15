import type { CodeCompletionsClient } from '@sourcegraph/cody-shared'
import { ps } from '@sourcegraph/cody-shared'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutoeditModelOptions, SuccessModelResponse } from './base'
import { SourcegraphCompletionsAdapter } from './sourcegraph-completions'
import { getMaxOutputTokensForAutoedits } from './utils'

describe('SourcegraphCompletionsAdapter', () => {
    let adapter: SourcegraphCompletionsAdapter
    let mockCompletionsClient: CodeCompletionsClient

    const options: AutoeditModelOptions = {
        url: 'https://sourcegraph.test/api/completions',
        model: 'anthropic/claude-2',
        prompt: {
            userMessage: ps`user message`,
        },
        codeToRewrite: 'const x = 1',
        userId: 'test-user',
        isChatModel: false,
        abortSignal: new AbortController().signal,
        timeoutMs: 10_000,
    }

    beforeEach(() => {
        // Create mock completions client
        mockCompletionsClient = {
            complete: vi.fn().mockResolvedValue({
                async *[Symbol.asyncIterator]() {
                    yield { completionResponse: { completion: 'response' } }
                },
            }),
        } as unknown as CodeCompletionsClient

        adapter = new SourcegraphCompletionsAdapter()
    })

    afterAll(() => {
        vi.restoreAllMocks()
    })

    it('sends correct request parameters', async () => {
        const mockComplete = vi.fn().mockResolvedValue({
            async *[Symbol.asyncIterator]() {
                yield { completionResponse: { completion: 'response' } }
            },
        })

        mockCompletionsClient.complete = mockComplete
        // @ts-ignore - accessing private property for testing
        adapter.client = mockCompletionsClient

        await adapter.getModelResponse(options)

        // Extract the complete call arguments
        const [params] = mockComplete.mock.calls[0]

        // Verify request parameters
        expect(params).toMatchObject({
            model: 'anthropic/claude-2',
            maxTokensToSample: getMaxOutputTokensForAutoedits(options.codeToRewrite),
            temperature: 0.1,
            messages: [{ speaker: 'human', text: ps`user message` }],
            prediction: {
                type: 'content',
                content: 'const x = 1',
            },
            timeoutMs: 5_000,
        })
    })

    it('accumulates streamed response correctly', async () => {
        const mockComplete = vi.fn().mockResolvedValue({
            async *[Symbol.asyncIterator]() {
                yield { completionResponse: { completion: 'part1' } }
                yield { completionResponse: { completion: 'part1part2' } }
            },
        })

        // @ts-ignore - accessing private property for testing
        adapter.client = { complete: mockComplete }

        const responseGenerator = await adapter.getModelResponse(options)
        const responses = []
        for await (const response of responseGenerator) {
            responses.push(response)
        }
        const lastResponse = responses[responses.length - 1]
        expect((lastResponse as SuccessModelResponse).prediction).toBe('part1part2')
    })

    it('handles errors correctly', async () => {
        const error = new Error('Completion error')
        const mockComplete = vi.fn().mockRejectedValue(error)
        // @ts-ignore - accessing private property for testing
        adapter.client = { complete: mockComplete }

        await expect(adapter.getModelResponse(options)).rejects.toThrow(error)
    })
})
