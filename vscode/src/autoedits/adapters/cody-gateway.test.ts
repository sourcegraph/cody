import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    CLIENT_CAPABILITIES_FIXTURE,
    DOTCOM_URL,
    mockClientCapabilities,
    mockResolvedConfig,
    ps,
} from '@sourcegraph/cody-shared'

import type { AutoeditModelOptions } from './base'
import { CodyGatewayAdapter } from './cody-gateway'

describe('CodyGatewayAdapter', () => {
    let adapter: CodyGatewayAdapter

    const options: AutoeditModelOptions = {
        url: 'https://test-gateway.sourcegraph.com/v1/completions',
        model: 'anthropic/claude-2',
        prompt: {
            systemMessage: ps`system message`,
            userMessage: ps`user message`,
        },
        codeToRewrite: 'const x = 1',
        userId: 'test-user',
        isChatModel: true,
    }

    const mockFetch = vi.fn()

    beforeEach(() => {
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
        mockResolvedConfig({
            configuration: {},
            auth: {
                accessToken: 'sgp_local_f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0',
                serverEndpoint: DOTCOM_URL.toString(),
            },
        })
        global.fetch = mockFetch
        adapter = new CodyGatewayAdapter()
        mockFetch.mockReset()
    })

    afterAll(() => {
        vi.restoreAllMocks()
    })

    it('sends correct request parameters for chat model', async () => {
        // Mock successful response
        mockFetch.mockResolvedValueOnce({
            status: 200,
            json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
        })

        await adapter.getModelResponse(options)

        // Verify the fetch call
        expect(mockFetch).toHaveBeenCalledWith(options.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: expect.stringContaining('sgd_'),
                'X-Sourcegraph-Feature': 'code_completions',
            },
            body: expect.stringContaining('"model":"anthropic/claude-2"'),
        })

        // Verify request body structure
        const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(requestBody).toEqual(
            expect.objectContaining({
                stream: false,
                model: options.model,
                temperature: 0.1,
                response_format: { type: 'text' },
                prediction: {
                    type: 'content',
                    content: options.codeToRewrite,
                },
                rewrite_speculation: true,
                user: options.userId,
                messages: expect.any(Array),
            })
        )
    })

    it('sends correct request parameters for completions model', async () => {
        const nonChatOptions = { ...options, isChatModel: false }

        mockFetch.mockResolvedValueOnce({
            status: 200,
            json: () => Promise.resolve({ choices: [{ text: 'response' }] }),
        })

        await adapter.getModelResponse(nonChatOptions)

        const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(requestBody).toEqual(
            expect.objectContaining({
                stream: false,
                model: options.model,
                temperature: 0,
                response_format: { type: 'text' },
                prediction: {
                    type: 'content',
                    content: options.codeToRewrite,
                },
                rewrite_speculation: true,
                user: options.userId,
                prompt: nonChatOptions.prompt.userMessage.toString(),
            })
        )
    })

    it('handles error responses correctly', async () => {
        mockFetch.mockResolvedValueOnce({
            status: 400,
            text: () => Promise.resolve('Bad Request'),
        })

        await expect(adapter.getModelResponse(options)).rejects.toThrow('HTTP error!')
    })
})
