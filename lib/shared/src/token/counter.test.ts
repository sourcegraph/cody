import { describe, expect, it } from 'vitest'
import { OLLAMA_DEFAULT_CONTEXT_WINDOW } from '../llm-providers/ollama'
import type { Message } from '../sourcegraph-api'
import { CHAT_TOKEN_BUDGET, ENHANCED_CONTEXT_ALLOCATION, USER_CONTEXT_TOKEN_BUDGET } from './constants'
import { TokenCounter } from './counter'

const contextWindow = { chat: CHAT_TOKEN_BUDGET, user: 0, enhanced: 0 }

describe('TokenCounter class', () => {
    it('should initialize with the correct token budgets', () => {
        const counter = new TokenCounter(contextWindow)
        expect(counter.maxChatTokens).toBe(CHAT_TOKEN_BUDGET)
        // Context budget will be shared with chat budget.
        expect(counter.maxContextTokens.user).toBe(CHAT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.enhanced).toBe(CHAT_TOKEN_BUDGET * ENHANCED_CONTEXT_ALLOCATION)
    })

    it('should initialize with the correct token budgets for customized models', () => {
        const counter = new TokenCounter({ ...contextWindow, chat: 1234 })
        expect(counter.maxChatTokens).toBe(1234)
        expect(counter.maxContextTokens.user).toBe(1234)
        expect(counter.maxContextTokens.enhanced).toBe(Math.floor(1234 * ENHANCED_CONTEXT_ALLOCATION))
    })

    it('should initialize with the correct token budgets when user context is provided', () => {
        const counter = new TokenCounter({ ...contextWindow, user: USER_CONTEXT_TOKEN_BUDGET })
        expect(counter.maxChatTokens).toBe(CHAT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.user).toBe(USER_CONTEXT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.enhanced).toBe(CHAT_TOKEN_BUDGET * ENHANCED_CONTEXT_ALLOCATION)
    })

    it('should update token usage and return true when within limits', () => {
        const counter = new TokenCounter(contextWindow)
        const messages: Message[] = [
            { speaker: 'human', text: 'Hello' },
            { speaker: 'assistant', text: 'Hi there!' },
        ]
        expect(counter.updateUsage('chat', messages)).toBe(true)
        expect(counter.remainingTokens.chat).toBeLessThan(counter.maxChatTokens)
    })

    it('should return false when token usage exceeds limits', () => {
        const counter = new TokenCounter({ chat: 5, user: 0, enhanced: 0 })
        const messages: Message[] = [
            { speaker: 'human', text: 'This is a very long message that will exceed the token limit.' },
        ]
        expect(counter.updateUsage('chat', messages)).toBe(false)
    })

    it('should allocate tokens correctly when chat and user context share the same budget', () => {
        const counter = new TokenCounter({ ...contextWindow, chat: OLLAMA_DEFAULT_CONTEXT_WINDOW })
        const messages: Message[] = [
            { speaker: 'human', text: 'Hello' },
            { speaker: 'assistant', text: 'Hi there!' },
        ]
        counter.updateUsage('chat', messages)
        expect(counter.remainingTokens.chat).toBe(counter.remainingTokens.context.user)
        expect(counter.remainingTokens.context.enhanced).toBeLessThan(counter.remainingTokens.chat)
    })

    it('should allocate tokens correctly when chat and user context have separate budgets', () => {
        const counter = new TokenCounter({ ...contextWindow, user: USER_CONTEXT_TOKEN_BUDGET })
        const chatMessages: Message[] = [
            { speaker: 'human', text: 'Hello' },
            { speaker: 'assistant', text: 'Hi there!' },
        ]
        const userContextMessages: Message[] = [
            { speaker: 'system', text: 'You are a helpful assistant.' },
        ]
        counter.updateUsage('chat', chatMessages)
        counter.updateUsage('user', userContextMessages)
        expect(counter.remainingTokens.chat).toBeLessThan(counter.maxChatTokens)
        expect(counter.remainingTokens.context.user).toBeLessThan(counter.maxContextTokens.user)
        expect(counter.remainingTokens.context.enhanced).toBeLessThan(counter.maxContextTokens.enhanced)
    })

    it('should allocate tokens correctly on shared budget when prompts are submitted out of order', () => {
        const counter = new TokenCounter({ chat: 30, user: 0, enhanced: 0 })
        counter.updateUsage('user', [
            { speaker: 'human', text: 'Here is my selected code...' },
            { speaker: 'assistant', text: 'ok' },
            { speaker: 'human', text: 'Here is my selected code...' },
            { speaker: 'assistant', text: 'ok' },
        ])
        expect(counter.remainingTokens.chat).toBe(12)
        expect(counter.remainingTokens.chat).toBe(counter.remainingTokens.context.user)
        expect(counter.remainingTokens.context.enhanced).toBe(7) // 60% of 12
        // Add enhanced context next.
        counter.updateUsage('enhanced', [
            { speaker: 'human', text: 'Hi' },
            { speaker: 'assistant', text: 'ok' },
        ])
        expect(counter.remainingTokens.context.enhanced).toBe(4) // 60% of 7
        expect(counter.remainingTokens.chat).toBe(7)
        expect(counter.remainingTokens.context.user).toBe(7)
        counter.updateUsage('chat', [
            { speaker: 'human', text: 'Hello' },
            { speaker: 'assistant', text: 'Hi there!' },
        ])
        expect(counter.remainingTokens.chat).toBe(1)
        expect(counter.remainingTokens.context.user).toBe(1)
        expect(counter.remainingTokens.context.enhanced).toBe(0)
        // Because we are already running out of tokens, the next chat message will be excluded,
        // so the remaining tokens will be the same.
        counter.updateUsage('chat', [
            { speaker: 'human', text: 'Hello' },
            { speaker: 'assistant', text: 'Hi there!' },
        ])
        expect(counter.remainingTokens.chat).toBe(1)
        expect(counter.remainingTokens.context.user).toBe(1)
        expect(counter.remainingTokens.context.enhanced).toBe(0)
    })
})

describe('TokenCounter static', () => {
    describe('countTokens', () => {
        it('should count the tokens in a given text', () => {
            const text = 'This is a sample text.'
            const tokenCount = TokenCounter.countTokens(text)
            expect(tokenCount).toBe(6)
        })

        it('should handle text with special characters', () => {
            const text = 'Hello, world! 🌍'
            const tokenCount = TokenCounter.countTokens(text)
            expect(tokenCount).toBe(7)
        })

        it('should normalize the text to NFKC before counting tokens', () => {
            const text = 'Café'
            const tokenCount = TokenCounter.countTokens(text)
            expect(tokenCount).toBe(3)
        })
    })

    describe('getMessagesTokenCount', () => {
        it('should count the tokens in a message', () => {
            const message: Message = {
                text: 'This is a sample message.',
                speaker: 'human',
            }
            const tokenCount = TokenCounter.getMessagesTokenCount([message])
            expect(tokenCount).toBe(7)
        })

        it('should calculate the total token count for an array of messages', () => {
            const messages: Message[] = [
                { text: 'Hello', speaker: 'human' },
                { text: 'How are you?', speaker: 'assistant' },
                { text: 'I am doing well, thank you.', speaker: 'human' },
            ]
            const tokenCount = TokenCounter.getMessagesTokenCount(messages)
            expect(tokenCount).toBe(16)
        })

        it('should return 0 for an empty array of messages', () => {
            const messages: Message[] = []
            const tokenCount = TokenCounter.getMessagesTokenCount(messages)
            expect(tokenCount).toBe(0)
        })

        it('should handle text with emojis', () => {
            const text = '😀 😄 😁 😆 😅 🤣'
            const tokenCount = TokenCounter.countTokens(text)
            expect(tokenCount).toBe(13)
        })

        it('should handle strings with only whitespace characters', () => {
            const text = '   \n\t\r'
            const tokenCount = TokenCounter.countTokens(text)
            expect(tokenCount).toBe(3)
        })
    })
})
