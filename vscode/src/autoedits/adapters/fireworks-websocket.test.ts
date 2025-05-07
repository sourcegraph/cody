import { mockResolvedConfig, ps } from '@sourcegraph/cody-shared'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { type AddressInfo, WebSocketServer } from 'ws'
import * as autoeditsConfig from '../autoedits-config'
import type { AutoeditModelOptions } from './base'
import { FireworksWebSocketAdapter } from './fireworks-websocket'

describe('FireworksWebsocketAdapter', () => {
    let adapter: FireworksWebSocketAdapter

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

    const server = new WebSocketServer({ port: 0 })

    const webSocketEndpoint = 'ws://localhost:' + (server.address() as AddressInfo).port
    const apiKey = 'test-api-key'
    autoeditsConfig.autoeditsProviderConfig.experimentalAutoeditsConfigOverride = {
        provider: 'fireworks-websocket',
        webSocketEndpoint,
        apiKey,
        tokenLimit: {} as any,
        ...options,
    }

    const messageFn = vi.fn()

    beforeAll(() => {
        mockResolvedConfig({
            auth: { credentials: { token: 'test_token' }, serverEndpoint: 'https://example.com' },
        })
        server.addListener('connection', client => {
            client.addEventListener('message', event => {
                const request = JSON.parse(event.data as string)
                // Pass the parsed request to messageFn
                const response = messageFn(request)
                client.send(response)
            })
        })
    })

    beforeEach(() => {
        adapter = new FireworksWebSocketAdapter(webSocketEndpoint)
        vi.useFakeTimers()
    })

    afterEach(() => {
        adapter.dispose()
        vi.clearAllTimers()
        vi.restoreAllMocks()
    })

    it('includes speculation parameters when hot streak is enabled', async () => {
        // Mock hot streak enabled
        vi.spyOn(autoeditsConfig, 'isHotStreakEnabled').mockReturnValue(true)

        messageFn.mockReturnValueOnce(
            JSON.stringify({
                'x-message-id': 'm_0',
                'x-message-headers': {},
                'x-message-body': {
                    data: {
                        choices: [{ message: { content: 'response' } }],
                    },
                },
                'x-message-status': 200,
                'x-message-status-text': 'OK',
            })
        )

        const generator = await adapter.getModelResponse(options)
        await generator.next()

        // Get the request object directly from the mock call
        const request = messageFn.mock.calls[0][0]
        expect(request['x-message-body']).toEqual(
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

        messageFn.mockReturnValueOnce(
            JSON.stringify({
                'x-message-id': 'm_0',
                'x-message-headers': {},
                'x-message-body': {
                    data: {
                        choices: [{ message: { content: 'response' } }],
                    },
                },
                'x-message-status': 200,
                'x-message-status-text': 'OK',
            })
        )

        const generator = await adapter.getModelResponse(options)
        await generator.next()

        // Get the request object directly from the mock call
        const request = messageFn.mock.calls[0][0]
        const body = request['x-message-body']
        expect(body.rewrite_speculation).toBeUndefined()
        expect(body.adaptive_speculation).toBeUndefined()
        expect(body.speculation_length_on_strong_match).toBeUndefined()
        expect(body.speculation_min_length_on_strong_match).toBeUndefined()
        expect(body.speculation_strong_match_threshold).toBeUndefined()
    })

    it('sends correct request parameters for chat model', async () => {
        messageFn.mockReturnValueOnce(
            JSON.stringify({
                'x-message-id': 'm_0',
                'x-message-headers': {},
                'x-message-body': {
                    data: {
                        choices: [{ message: { content: 'response' } }],
                    },
                },
                'x-message-status': 200,
                'x-message-status-text': 'OK',
            })
        )
        const generator = await adapter.getModelResponse(options)
        const result = await generator.next()
        expect(result.value.prediction).toBe('response')
    })

    it('model request aborted before send', async () => {
        const controller = new AbortController()
        const testOptions: AutoeditModelOptions = {
            ...options,
            abortSignal: controller.signal,
        }

        controller.abort()
        const generator = await adapter.getModelResponse(testOptions)
        await expect(() => generator.next()).rejects.toThrow('abort signal received, message not sent')
        expect(messageFn).toBeCalledTimes(0)
    })

    it('model request aborted after', async () => {
        const controller = new AbortController()
        const testOptions: AutoeditModelOptions = {
            ...options,
            abortSignal: controller.signal,
        }

        messageFn.mockImplementation(request => {
            controller.abort()

            return JSON.stringify({
                'x-message-id': 'm_0',
                'x-message-headers': {},
                'x-message-body': {
                    choices: [{ message: { content: 'response' } }],
                },
                'x-message-status': 200,
                'x-message-status-text': 'OK',
            })
        })
        const generator = await adapter.getModelResponse(testOptions)
        await expect(() => generator.next()).rejects.toThrow(
            'abort signal received, message not handled'
        )
    })
})
