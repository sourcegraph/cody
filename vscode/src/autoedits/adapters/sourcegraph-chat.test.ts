import { ps } from '@sourcegraph/cody-shared'
import type { ChatClient } from '@sourcegraph/cody-shared'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutoeditModelOptions } from './base'
import { SourcegraphChatAdapter } from './sourcegraph-chat'
import { getMaxOutputTokensForAutoedits } from './utils'

describe('SourcegraphChatAdapter', () => {
    let adapter: SourcegraphChatAdapter
    let mockChatClient: ChatClient

    const options: AutoeditModelOptions = {
        url: 'https://sourcegraph.test/api/chat',
        model: 'anthropic/claude-2',
        prompt: {
            systemMessage: ps`system message`,
            userMessage: ps`user message`,
        },
        codeToRewrite: 'const x = 1',
        userId: 'test-user',
        isChatModel: true,
    }

    beforeEach(() => {
        // Create mock chat client with properly typed mock function
        mockChatClient = {
            chat: vi.fn().mockResolvedValue({
                async *[Symbol.asyncIterator]() {
                    yield { type: 'change', text: 'response' }
                    yield { type: 'complete' }
                },
            }),
        } as unknown as ChatClient

        adapter = new SourcegraphChatAdapter(mockChatClient)
    })

    afterAll(() => {
        vi.restoreAllMocks()
    })

    it('sends correct request parameters', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            async *[Symbol.asyncIterator]() {
                yield { type: 'change', text: 'response' }
                yield { type: 'complete' }
            },
        })

        mockChatClient.chat = mockChat

        await adapter.getModelResponse(options)

        // Extract just the first two arguments for verification
        const [messages, chatOptions] = mockChat.mock.calls[0]

        // Verify messages array
        expect(messages).toMatchObject([
            { speaker: 'system', text: ps`system message` },
            { speaker: 'human', text: ps`user message` },
        ])

        // Verify chat options
        expect(chatOptions).toMatchObject({
            model: 'anthropic/claude-2',
            maxTokensToSample: getMaxOutputTokensForAutoedits(options.codeToRewrite),
            temperature: 0,
            prediction: {
                type: 'content',
                content: 'const x = 1',
            },
        })
    })

    it('accumulates streamed response correctly', async () => {
        const mockChat = vi.fn().mockResolvedValue({
            async *[Symbol.asyncIterator]() {
                yield { type: 'change', text: 'part1' }
                yield { type: 'change', text: 'part1part2' }
                yield { type: 'complete' }
            },
        })

        mockChatClient.chat = mockChat

        const response = await adapter.getModelResponse(options)
        expect(response).toBe('part1part2')
    })

    it('handles errors correctly', async () => {
        const error = new Error('Chat error')
        const mockChat = vi.fn().mockRejectedValue(error)
        mockChatClient.chat = mockChat

        await expect(adapter.getModelResponse(options)).rejects.toThrow(error)
    })
})
