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
        timeoutMs: 10_000,
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

    it('includes speculation parameters when hot streak is enabled', async () => {
        vi.spyOn(autoeditsConfig, 'isHotStreakEnabled').mockReturnValue(true)

        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
        })

        const generator = await adapter.getModelResponse(options)
        await generator.next() // Trigger the API call

        const requestBody = JSON.parse(mockFetchSpy.mock.calls[0][1].body)
        expect(requestBody).toEqual(
            expect.objectContaining({
                rewrite_speculation: true,
                adaptive_speculation: true,
                speculation_length_on_strong_match: 500,
                speculation_min_length_on_strong_match: 500,
                speculation_strong_match_threshold: 20,
            })
        )
    })

    it('does not include speculation parameters when hot streak is disabled', async () => {
        vi.spyOn(autoeditsConfig, 'isHotStreakEnabled').mockReturnValue(false)

        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
        })

        const generator = await adapter.getModelResponse(options)
        await generator.next() // Trigger the API call

        const requestBody = JSON.parse(mockFetchSpy.mock.calls[0][1].body)
        expect(requestBody.rewrite_speculation).toBeUndefined()
        expect(requestBody.adaptive_speculation).toBeUndefined()
        expect(requestBody.speculation_length_on_strong_match).toBeUndefined()
        expect(requestBody.speculation_min_length_on_strong_match).toBeUndefined()
        expect(requestBody.speculation_strong_match_threshold).toBeUndefined()
    })

    it('sends correct request parameters for chat model', async () => {
        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
        })

        const generator = await adapter.getModelResponse(options)
        await generator.next() // Start the generator to trigger the API call

        expect(mockFetchSpy).toHaveBeenCalledWith(options.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
                'Accept-Encoding': 'gzip;q=0',
            },
            body: expect.stringContaining('"model":"accounts/fireworks/models/llama-v2-7b"'),
            signal: expect.any(AbortSignal),
        })

        const requestBody = JSON.parse(mockFetchSpy.mock.calls[0][1].body)
        expect(requestBody).toEqual(
            expect.objectContaining({
                stream: true,
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

        const generator = await adapter.getModelResponse(nonChatOptions)
        await generator.next() // Start the generator to trigger the API call

        const requestBody = JSON.parse(mockFetchSpy.mock.calls[0][1].body)
        expect(requestBody).toEqual(
            expect.objectContaining({
                stream: true,
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

        const generator = await adapter.getModelResponse(options)
        await expect(generator.next()).rejects.toThrow()
    })

    it('returns correct response for chat model', async () => {
        const expectedResponse = 'modified code'
        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ message: { content: expectedResponse } }] }),
        })

        const responseGenerator = await adapter.getModelResponse(options)
        const responses = []
        for await (const response of responseGenerator) {
            responses.push(response)
        }
        const lastResponse = responses[responses.length - 1]
        expect((lastResponse as SuccessModelResponse).prediction).toBe(expectedResponse)
    })

    it('returns correct response for completions model', async () => {
        const expectedResponse = 'modified code'
        const nonChatOptions = { ...options, isChatModel: false }

        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ text: expectedResponse }] }),
        })

        const responseGenerator = await adapter.getModelResponse(nonChatOptions)
        const responses = []
        for await (const response of responseGenerator) {
            responses.push(response)
        }

        expect(responses.length).toBeGreaterThan(0)
        const lastResponse = responses[responses.length - 1]
        expect(lastResponse.type !== 'aborted' ? lastResponse.prediction : null).toBe(expectedResponse)
    })
})
