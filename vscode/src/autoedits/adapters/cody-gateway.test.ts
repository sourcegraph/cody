import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    CLIENT_CAPABILITIES_FIXTURE,
    DOTCOM_URL,
    mockClientCapabilities,
    mockResolvedConfig,
    ps,
} from '@sourcegraph/cody-shared'
import * as shared from '@sourcegraph/cody-shared'
import * as autoeditsConfig from '../autoedits-config'

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
        abortSignal: new AbortController().signal,
        timeoutMs: 10_000,
    }

    const mockFetchSpy = vi.spyOn(shared, 'fetch') as any

    beforeEach(() => {
        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
        mockResolvedConfig({
            configuration: {},
            auth: {
                credentials: { token: 'sgp_local_f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0' },
                serverEndpoint: DOTCOM_URL.toString(),
            },
        })
        adapter = new CodyGatewayAdapter()
        mockFetchSpy.mockReset()
    })

    afterAll(() => {
        vi.restoreAllMocks()
    })

    it('includes speculation parameters when hot streak is enabled', async () => {
        // Mock hot streak enabled
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
        // Mock hot streak disabled
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
        // Mock successful response
        mockFetchSpy.mockResolvedValueOnce({
            status: 200,
            headers: new Headers(),
            json: () => Promise.resolve({ choices: [{ message: { content: 'response' } }] }),
        })

        const generator = await adapter.getModelResponse(options)
        await generator.next() // Start the generator to trigger the API call

        // Verify the fetch call
        expect(mockFetchSpy).toHaveBeenCalledWith(options.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: expect.stringContaining('sgd_'),
                'X-Sourcegraph-Feature': 'code_completions',
                'Accept-Encoding': 'gzip;q=0',
            },
            body: expect.stringContaining('"model":"anthropic/claude-2"'),
            signal: expect.any(AbortSignal),
        })

        // Verify request body structure
        const requestBody = JSON.parse(mockFetchSpy.mock.calls[0][1].body)
        expect(requestBody).toEqual(
            expect.objectContaining({
                stream: true,
                model: options.model,
                temperature: 0.1,
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
        await expect(generator.next()).rejects.toThrow('HTTP error!')
    })
})
