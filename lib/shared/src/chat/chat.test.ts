import { describe, expect, it } from 'vitest'
import { type Mock, afterEach, beforeEach, vi } from 'vitest'
import { AUTH_STATUS_FIXTURE_AUTHED, graphqlClient } from '..'
import { mockAuthStatus } from '../auth/authStatus'
import { ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'
import * as siteVersionModule from '../sourcegraph-api/siteVersion'
import { ChatClient, buildChatRequestParams, sanitizeMessages } from './chat'

const hello = ps`Hello`
const hiThere = ps`Hi there!`
const isAnyoneThere = ps`Is anyone there?`
const followUpQuestion = ps`Can you explain more?`

describe('sanitizeMessages', () => {
    it('removes empty assistant messages and the human question before it', () => {
        const messages = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant' },
            { speaker: 'human', text: isAnyoneThere },
        ] satisfies Message[]

        const expected = [{ speaker: 'human', text: isAnyoneThere }]

        const result = sanitizeMessages(messages)

        expect(result).toEqual(expected)
    })

    it('removes trailing empty assistant message', () => {
        const messages = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant', text: hiThere },
            { speaker: 'assistant' },
        ] satisfies Message[]

        const expected = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant', text: hiThere },
        ]

        const result = sanitizeMessages(messages)

        expect(result).toEqual(expected)
    })

    it('returns original when no empty messages', () => {
        const messages = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant', text: hiThere },
        ] satisfies Message[]

        const result = sanitizeMessages(messages)

        expect(result).toEqual(messages)
    })
})

describe('buildChatRequestParams', () => {
    it('sets apiVersion to 0 for Claude models older than 3.5', () => {
        const result = buildChatRequestParams({
            model: 'claude-2-sonnet',
            codyAPIVersion: 8,
            isFireworksTracingEnabled: false,
        })

        expect(result.apiVersion).toBe(0)
        expect(result.customHeaders).toEqual({})
    })

    it('keeps default apiVersion for Claude models 3.5 or newer', () => {
        const result = buildChatRequestParams({
            model: 'claude-3-5-sonnet',
            codyAPIVersion: 8,
            isFireworksTracingEnabled: false,
        })

        expect(result.apiVersion).toBe(8)
        expect(result.customHeaders).toEqual({})
    })

    it('adds X-Fireworks-Genie header for Fireworks models with tracing enabled', () => {
        const result = buildChatRequestParams({
            model: 'fireworks/model',
            codyAPIVersion: 8,
            isFireworksTracingEnabled: true,
        })

        expect(result.apiVersion).toBe(8)
        expect(result.customHeaders).toEqual({ 'X-Fireworks-Genie': 'true' })
    })

    it('passes through interactionId when provided', () => {
        const result = buildChatRequestParams({
            model: 'model-name',
            codyAPIVersion: 8,
            isFireworksTracingEnabled: false,
            interactionId: 'test-interaction-id',
        })

        expect(result.interactionId).toBe('test-interaction-id')
    })
})

// Add this test suite after existing describe blocks
describe('ChatClient.chat', () => {
    let chatClient: ChatClient
    let mockCompletions: { stream: Mock }

    beforeEach(() => {
        mockAuthStatus(AUTH_STATUS_FIXTURE_AUTHED)

        // Mock inferCodyApiVersion to return a specific version
        vi.spyOn(siteVersionModule, 'inferCodyApiVersion').mockReturnValue(8)

        // Mock currentSiteVersion to return a consistent object with your desired codyAPIVersion
        vi.spyOn(siteVersionModule, 'currentSiteVersion').mockResolvedValue({
            siteVersion: '1.2.3',
            codyAPIVersion: 8,
        })

        // Mock stream method that returns an async generator
        mockCompletions = {
            stream: vi.fn().mockImplementation(async function* () {
                yield { text: 'mocked response' }
            }),
        }

        chatClient = new ChatClient(mockCompletions as any)

        vi.spyOn(graphqlClient, 'getSiteVersion').mockResolvedValue('1.2.3')
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('streams chat completion with standard parameters', async () => {
        const messages: Message[] = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant', text: hiThere },
        ]

        const params = {
            maxTokensToSample: 2000,
            model: 'anthropic/claude-3-sonnet',
        }

        const generator = await chatClient.chat(messages, params)
        const firstResponse = await generator.next()

        expect(mockCompletions.stream).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: [
                    { speaker: 'human', text: hello, cacheEnabled: undefined, content: undefined },
                    { speaker: 'assistant', text: hiThere },
                ],
                maxTokensToSample: 2000,
                model: 'anthropic/claude-3-sonnet',
                temperature: 0.2,
                topK: -1,
                topP: -1,
            }),
            expect.objectContaining({
                apiVersion: 0,
                customHeaders: {},
                interactionId: undefined,
            }),
            undefined
        )

        expect(firstResponse.value).toEqual({ text: 'mocked response' })
    })

    it('throws error when not authenticated', async () => {
        mockAuthStatus({ ...AUTH_STATUS_FIXTURE_AUTHED, authenticated: false })

        const messages: Message[] = [{ speaker: 'human', text: hello }]
        const params = {
            maxTokensToSample: 1000,
            model: 'anthropic/claude-3-sonnet',
        }

        await expect(chatClient.chat(messages, params)).rejects.toThrow('not authenticated')
    })

    it('appends empty assistant message for older API versions when last message is human', async () => {
        vi.spyOn(graphqlClient, 'getSiteVersion').mockResolvedValue('1.2.3')

        const messages: Message[] = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant', text: hiThere },
            { speaker: 'human', text: followUpQuestion },
        ]

        const params = {
            maxTokensToSample: 1000,
            model: 'claude-2-sonnet',
        }

        await chatClient.chat(messages, params)

        expect(mockCompletions.stream).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: [
                    { speaker: 'human', text: hello },
                    { speaker: 'assistant', text: hiThere },
                    { speaker: 'human', text: followUpQuestion },
                    { speaker: 'assistant' },
                ],
            }),
            expect.any(Object),
            undefined
        )
    })

    it('passes through abort signal and interaction ID', async () => {
        const messages: Message[] = [{ speaker: 'human', text: hello }]
        const params = {
            maxTokensToSample: 1000,
            model: 'anthropic/claude-3-sonnet',
        }

        const abortController = new AbortController()
        const interactionId = 'test-interaction-id'

        await chatClient.chat(messages, params, abortController.signal, interactionId)

        expect(mockCompletions.stream).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                interactionId: 'test-interaction-id',
            }),
            abortController.signal
        )
    })

    it('sanitizes messages before sending them', async () => {
        const messagesWithEmpty: Message[] = [
            { speaker: 'human', text: hello },
            { speaker: 'assistant', text: ps`` }, // Empty assistant message
            { speaker: 'human', text: followUpQuestion },
            { speaker: 'assistant', text: ps`` },
        ]

        const params = {
            maxTokensToSample: 1000,
            model: 'anthropic/claude-3.5-sonnet',
            cacheEnabled: undefined,
            content: undefined,
        }

        await chatClient.chat(messagesWithEmpty, params)

        // Expect sanitized messages (first human message and empty assistant removed)
        expect(mockCompletions.stream).toHaveBeenCalledWith(
            expect.objectContaining({
                messages: [{ speaker: 'human', text: followUpQuestion }],
            }),
            expect.any(Object),
            undefined
        )
    })
})
