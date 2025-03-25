import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ps } from '@sourcegraph/cody-shared'

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
        server.addListener('connection', client => {
            client.addEventListener('message', event => {
                const request = JSON.parse(event.data as string)
                const response = messageFn(request)
                client.send(response)
            })
        })
    })

    beforeEach(() => {
        adapter = new FireworksWebSocketAdapter()
        vi.useFakeTimers()
    })

    afterAll(() => {
        vi.restoreAllMocks()
    })

    it('sends correct request parameters for chat model', async () => {
        messageFn.mockReturnValueOnce(
            JSON.stringify({
                'x-message-id': 'm_0',
                'x-message-headers': {},
                'x-message-body': {
                    choices: [{ message: { content: 'response' } }],
                },
                'x-message-status': 200,
                'x-message-status-text': 'OK',
            })
        )
        await adapter.getModelResponse(options)
    })

    it('send times out', async () => {
        messageFn.mockImplementation(() => {
            vi.advanceTimersByTime(4000)
            return JSON.stringify({
                'x-message-id': 'm_0',
                'x-message-headers': JSON.stringify({}),
                'x-message-body': JSON.stringify({
                    choices: [{ message: { content: 'response' } }],
                }),
            })
        })
        expect(() => adapter.getModelResponse(options)).rejects.toThrow(
            'timeout in sending message to fireworks'
        )
    })
})
