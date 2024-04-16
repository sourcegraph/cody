import { describe, expect, it } from 'vitest'
import { OLLAMA_DEFAULT_CONTEXT_WINDOW } from '../llm-providers/ollama'
import { ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'
import { CHAT_TOKEN_BUDGET, ENHANCED_CONTEXT_ALLOCATION, USER_CONTEXT_TOKEN_BUDGET } from './constants'
import { TokenCounter } from './counter'

describe('TokenCounter class', () => {
    const claude3Budget = CHAT_TOKEN_BUDGET + USER_CONTEXT_TOKEN_BUDGET
    const nonClaude3Budget = CHAT_TOKEN_BUDGET

    it('should initialize with the correct token budgets for claude 3 models', () => {
        const counter = new TokenCounter(claude3Budget)
        expect(counter.totalBudget).toBe(claude3Budget)
        expect(counter.maxChatTokens).toBe(CHAT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.user).toBe(USER_CONTEXT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.enhanced).toBe(CHAT_TOKEN_BUDGET * ENHANCED_CONTEXT_ALLOCATION)
    })

    it('should initialize with the correct token budgets for non-claude 3 models', () => {
        const counter = new TokenCounter(nonClaude3Budget)
        expect(counter.totalBudget).toBe(nonClaude3Budget)
        expect(counter.maxChatTokens).toBe(nonClaude3Budget)
        expect(counter.maxContextTokens.user).toBe(nonClaude3Budget)
        expect(counter.maxContextTokens.enhanced).toBe(nonClaude3Budget * ENHANCED_CONTEXT_ALLOCATION)
    })

    it('should initialize with the correct token budgets for customized models', () => {
        const customizedBudget = 1234
        const counter = new TokenCounter(customizedBudget)
        expect(counter.totalBudget).toBe(customizedBudget)
        expect(counter.maxChatTokens).toBe(customizedBudget)
        expect(counter.maxContextTokens.user).toBe(customizedBudget)
        expect(counter.maxContextTokens.enhanced).toBe(
            Math.floor(customizedBudget * ENHANCED_CONTEXT_ALLOCATION)
        )
    })

    it('should update token usage and return true when within limits', () => {
        const counter = new TokenCounter(CHAT_TOKEN_BUDGET)
        const messages: Message[] = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ]
        expect(counter.updateUsage('chat', messages)).toBe(true)
        expect(counter.remainingTokens.chat).toBeLessThan(counter.maxChatTokens)
    })

    it('should return false when token usage exceeds limits', () => {
        const counter = new TokenCounter(5)
        const messages: Message[] = [
            {
                speaker: 'human',
                text: ps`This is a very long message that will exceed the token limit.`,
            },
        ]
        expect(counter.updateUsage('chat', messages)).toBe(false)
    })

    it('should allocate tokens correctly when chat and user context share the same budget', () => {
        const counter = new TokenCounter(OLLAMA_DEFAULT_CONTEXT_WINDOW)
        const messages: Message[] = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ]
        counter.updateUsage('chat', messages)
        expect(counter.remainingTokens.chat).toBe(counter.remainingTokens.context.user)
        expect(counter.remainingTokens.context.enhanced).toBeLessThan(counter.remainingTokens.chat)
    })

    it('should allocate tokens correctly when chat and user context have separate budgets', () => {
        const counter = new TokenCounter(claude3Budget)
        const chatMessages: Message[] = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ]
        const userContextMessages: Message[] = [
            { speaker: 'system', text: ps`You are a helpful assistant.` },
        ]
        counter.updateUsage('chat', chatMessages)
        counter.updateUsage('user', userContextMessages)
        expect(counter.remainingTokens.chat).toBeLessThan(counter.maxChatTokens)
        expect(counter.remainingTokens.context.user).toBeLessThan(counter.maxContextTokens.user)
        expect(counter.remainingTokens.context.enhanced).toBe(counter.maxContextTokens.enhanced)
    })
})

describe('TokenCounter static', () => {
    describe('countTokens', () => {
        it('should count the tokens in a given text', () => {
            const text = ps`This is a sample text.`
            const tokenCount = TokenCounter.countPromptString(text)
            expect(tokenCount).toBe(6)
        })

        it('should handle text with special characters', () => {
            const text = ps`Hello, world! 🌍`
            const tokenCount = TokenCounter.countPromptString(text)
            expect(tokenCount).toBe(7)
        })

        it('should normalize the text to NFKC before counting tokens', () => {
            const text = ps`Café'`
            const tokenCount = TokenCounter.countPromptString(text)
            expect(tokenCount).toBe(3)
        })
    })

    describe('getMessagesTokenCount', () => {
        it('should count the tokens in a message', () => {
            const message: Message = {
                text: ps`This is a sample message.`,
                speaker: 'human',
            }
            const tokenCount = TokenCounter.getMessagesTokenCount([message])
            expect(tokenCount).toBe(7)
        })

        it('should calculate the total token count for an array of messages', () => {
            const messages: Message[] = [
                { text: ps`Hello`, speaker: 'human' },
                { text: ps`How are you?`, speaker: 'assistant' },
                { text: ps`I am doing well, thank you.`, speaker: 'human' },
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
            const text = ps`😀 😄 😁 😆 😅 🤣`
            const tokenCount = TokenCounter.countPromptString(text)
            expect(tokenCount).toBe(13)
        })

        it('should handle strings with only whitespace characters', () => {
            const text = ps`   \n\t\r`
            const tokenCount = TokenCounter.countPromptString(text)
            expect(tokenCount).toBe(3)
        })
    })
})
