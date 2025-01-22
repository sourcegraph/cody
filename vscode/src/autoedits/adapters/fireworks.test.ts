import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ps } from '@sourcegraph/cody-shared'

import * as autoeditsConfig from '../autoedits-config'

import type { AutoeditModelOptions } from './base'
import { FireworksAdapter } from './fireworks'

describe('FireworksAdapter', () => {
    let adapter: FireworksAdapter

    const options: AutoeditModelOptions = {
        url: 'https://api.fireworks.ai/v1/completions',
        model: 'accounts/fireworks/models/llama-v2-7b',
        prompt: {
            systemMessage: ps`system message`,
            userMessage: ps`user message`,
        },
        codeToRewrite: 'const x = 1',
        userId: 'test-user',
        isChatModel: true,
        requestId: 'test-request-id',
    }

    const apiKey = 'test-api-key'
    autoeditsConfig.autoeditsProviderConfig.experimentalAutoeditsConfigOverride = {
        provider: 'fireworks',
        apiKey,
        tokenLimit: {} as any,
        ...options,
    }

    const mockFetch = vi.fn()

    beforeEach(() => {
        global.fetch = mockFetch
        adapter = new FireworksAdapter()
        mockFetch.mockReset()
    })

    afterAll(() => {
        vi.restoreAllMocks()
    })

    it('sends correct request parameters for chat model', async () => {
        mockFetch.mockResolvedValueOnce({
            status: 200,
            json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
        })

        await adapter.getModelResponse(options)

        expect(mockFetch).toHaveBeenCalledWith(options.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: expect.stringContaining('"model":"accounts/fireworks/models/llama-v2-7b"'),
        })

        const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body)
        expect(requestBody).toEqual(
            expect.objectContaining({
                stream: false,
                model: options.model,
                temperature: 0,
                max_tokens: expect.any(Number),
                response_format: { type: 'text' },
                prediction: {
                    type: 'content',
                    content: options.codeToRewrite,
                },
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
                max_tokens: expect.any(Number),
                response_format: { type: 'text' },
                prediction: {
                    type: 'content',
                    content: options.codeToRewrite,
                },
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

        await expect(adapter.getModelResponse(options)).rejects.toThrow()
    })

    it('returns correct response for chat model', async () => {
        const expectedResponse = 'modified code'
        mockFetch.mockResolvedValueOnce({
            status: 200,
            json: () => Promise.resolve({ choices: [{ message: { content: expectedResponse } }] }),
        })

        const response = await adapter.getModelResponse(options)
        expect(response).toBe(expectedResponse)
    })

    it('returns correct response for completions model', async () => {
        const expectedResponse = 'modified code'
        const nonChatOptions = { ...options, isChatModel: false }

        mockFetch.mockResolvedValueOnce({
            status: 200,
            json: () => Promise.resolve({ choices: [{ text: expectedResponse }] }),
        })

        const response = await adapter.getModelResponse(nonChatOptions)
        expect(response).toBe(expectedResponse)
    })
})
