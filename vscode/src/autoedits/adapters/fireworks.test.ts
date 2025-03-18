import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ps } from '@sourcegraph/cody-shared'
import * as shared from '@sourcegraph/cody-shared'

import * as autoeditsConfig from '../autoedits-config'

import type { AutoeditModelOptions, SuccessModelResponse } from './base'
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
        abortSignal: new AbortController().signal,
    }

    const apiKey = 'test-api-key'
    autoeditsConfig.autoeditsProviderConfig.experimentalAutoeditsConfigOverride = {
        provider: 'fireworks',
        apiKey,
        tokenLimit: {} as any,
        ...options,
    }

    const mockFetchSpy = vi.spyOn(shared, 'fetch') as any

    beforeEach(() => {
        adapter = new FireworksAdapter()
        mockFetchSpy.mockReset()
    })

    afterAll(() => {
        vi.restoreAllMocks()
    })

    it('sends correct request parameters for chat model', async () => {
        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
        })

        await adapter.getModelResponse(options)

        expect(mockFetchSpy).toHaveBeenCalledWith(options.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: expect.stringContaining('"model":"accounts/fireworks/models/llama-v2-7b"'),
            signal: expect.any(AbortSignal),
        })

        const requestBody = JSON.parse(mockFetchSpy.mock.calls[0][1].body)
        expect(requestBody).toEqual(
            expect.objectContaining({
                stream: false,
                model: options.model,
                temperature: 0.1,
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

        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ text: 'response' }] }),
        })

        await adapter.getModelResponse(nonChatOptions)

        const requestBody = JSON.parse(mockFetchSpy.mock.calls[0][1].body)
        expect(requestBody).toEqual(
            expect.objectContaining({
                stream: false,
                model: options.model,
                temperature: 0.1,
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
        mockFetchSpy.mockResolvedValueOnce({
            status: 400,
            headers: new Headers(),
            text: () => Promise.resolve('Bad Request'),
        })

        await expect(adapter.getModelResponse(options)).rejects.toThrow()
    })

    it('returns correct response for chat model', async () => {
        const expectedResponse = 'modified code'
        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ message: { content: expectedResponse } }] }),
        })

        const response = await adapter.getModelResponse(options)
        expect((response as SuccessModelResponse).prediction).toBe(expectedResponse)
    })

    it('returns correct response for completions model', async () => {
        const expectedResponse = 'modified code'
        const nonChatOptions = { ...options, isChatModel: false }

        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ text: expectedResponse }] }),
        })

        const response = await adapter.getModelResponse(nonChatOptions)
        expect((response as SuccessModelResponse).prediction).toBe(expectedResponse)
    })
})
