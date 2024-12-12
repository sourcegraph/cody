import type { CodeCompletionsClient } from '@sourcegraph/cody-shared'
import { ps } from '@sourcegraph/cody-shared'
import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import type { AutoeditModelOptions } from '../prompt-provider'
import { SourcegraphCompletionsAdapter } from './sourcegraph-completions'
import { getMaxOutputTokensForAutoedits } from './utils'

describe('SourcegraphCompletionsAdapter', () => {
    let adapter: SourcegraphCompletionsAdapter
    let mockCompletionsClient: CodeCompletionsClient

    const options: AutoeditModelOptions = {
        url: 'https://sourcegraph.test/api/completions',
        model: 'anthropic/claude-2',
        apiKey: 'test-key',
        prompt: {
            userMessage: ps`user message`,
        },
        codeToRewrite: 'const x = 1',
        userId: 'test-user',
        isChatModel: false,
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
            temperature: 0.2,
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

        const response = await adapter.getModelResponse(options)
        expect(response).toBe('part1part2')
    })

    it('handles errors correctly', async () => {
        const error = new Error('Completion error')
        const mockComplete = vi.fn().mockRejectedValue(error)
        // @ts-ignore - accessing private property for testing
        adapter.client = { complete: mockComplete }

        await expect(adapter.getModelResponse(options)).rejects.toThrow(error)
    })
})
