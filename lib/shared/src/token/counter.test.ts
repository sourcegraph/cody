import { describe, expect, it } from 'vitest'
import { OLLAMA_DEFAULT_CONTEXT_WINDOW } from '../llm-providers/ollama'
import { ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'
import { CHAT_TOKEN_BUDGET, ENHANCED_CONTEXT_ALLOCATION, USER_CONTEXT_TOKEN_BUDGET } from './constants'
import { TokenCounter } from './counter'

const preamble: Message[] = [
    { speaker: 'human', text: ps`Preamble` },
    { speaker: 'assistant', text: ps`OK` },
]

describe('TokenCounter class', () => {
    it('should initialize with the correct token budgets', () => {
        const counter = new TokenCounter({ input: CHAT_TOKEN_BUDGET })
        expect(counter.maxChatTokens).toBe(CHAT_TOKEN_BUDGET)
        // Context budget will be shared with chat budget.
        expect(counter.maxContextTokens.user).toBe(CHAT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.enhanced).toBe(CHAT_TOKEN_BUDGET * ENHANCED_CONTEXT_ALLOCATION)
    })

    it('should initialize with the correct token budgets for a customized context window', () => {
        const counter = new TokenCounter({ input: 1234 })
        expect(counter.maxChatTokens).toBe(1234)
        expect(counter.maxContextTokens.user).toBe(1234)
        expect(counter.maxContextTokens.enhanced).toBe(Math.floor(1234 * ENHANCED_CONTEXT_ALLOCATION))
    })

    it('should initialize with the correct token budgets when user context is provided', () => {
        const counter = new TokenCounter({
            input: CHAT_TOKEN_BUDGET,
            context: { user: USER_CONTEXT_TOKEN_BUDGET },
        })
        expect(counter.maxChatTokens).toBe(CHAT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.user).toBe(USER_CONTEXT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.enhanced).toBe(CHAT_TOKEN_BUDGET * ENHANCED_CONTEXT_ALLOCATION)
    })

    it('should throw error when adding input without preamble', () => {
        const counter = new TokenCounter({ input: CHAT_TOKEN_BUDGET })
        expect(() => counter.updateUsage('input', [{ speaker: 'human', text: ps`Hello` }])).toThrowError(
            'Preamble must be updated before Chat input.'
        )
    })

    it('should update token usage and return true when within limits', () => {
        const counter = new TokenCounter({ input: CHAT_TOKEN_BUDGET })
        expect(counter.updateUsage('preamble', preamble)).toBe(true)
        expect(
            counter.updateUsage('input', [
                { speaker: 'human', text: ps`Hello` },
                { speaker: 'assistant', text: ps`Hi!` },
            ] as Message[])
        ).toBe(true)
    })

    it('should return false when token usage exceeds limits', () => {
        const counter = new TokenCounter({ input: 5 })
        expect(counter.updateUsage('preamble', preamble)).toBe(true)
        expect(
            counter.updateUsage('input', [
                {
                    speaker: 'human',
                    text: ps`This is a very long message that will exceed the token limit.`,
                },
            ])
        ).toBe(false)
    })

    it('should update token usage and return true when within limits - chat and user context share the same budget', () => {
        const counter = new TokenCounter({ input: OLLAMA_DEFAULT_CONTEXT_WINDOW })
        expect(counter.updateUsage('preamble', preamble)).toBe(true)
        const messages: Message[] = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ]
        expect(counter.updateUsage('input', messages)).toBe(true)
    })

    it('should update token usage and return true when within limits - chat and user context have separate budgets', () => {
        const counter = new TokenCounter({
            input: CHAT_TOKEN_BUDGET,
            context: { user: USER_CONTEXT_TOKEN_BUDGET },
        })
        expect(counter.updateUsage('preamble', preamble)).toBe(true)
        expect(
            counter.updateUsage('input', [
                { speaker: 'human', text: ps`Hello` },
                { speaker: 'assistant', text: ps`Hi there!` },
            ])
        ).toBe(true)
        expect(
            counter.updateUsage('user', [{ speaker: 'system', text: ps`You are a helpful assistant.` }])
        ).toBe(true)
    })

    it('should throw error when trying to update enhanced context token usage before chat input', () => {
        const counter = new TokenCounter({ input: 10, context: { user: 20 } })
        expect(counter.updateUsage('preamble', preamble)).toBe(true)
        expect(() => {
            counter.updateUsage('enhanced', [
                { speaker: 'human', text: ps`Hi` },
                { speaker: 'assistant', text: ps`ok` },
            ])
        }).toThrowError('Chat token usage must be updated before Context.')
    })

    it('should throw error when trying to update user context token usage before chat input', () => {
        const counter = new TokenCounter({ input: 10, context: { user: 20 } })
        expect(counter.updateUsage('preamble', preamble)).toBe(true)
        expect(() => {
            counter.updateUsage('user', [
                { speaker: 'human', text: ps`Hi` },
                { speaker: 'assistant', text: ps`ok` },
            ])
        }).toThrowError('Chat token usage must be updated before Context.')
    })

    it('should return false when exceeds limits - chat and user context share the same budget', () => {
        const counter = new TokenCounter({ input: 30 })
        expect(counter.updateUsage('preamble', preamble)).toBe(true)
        expect(
            counter.updateUsage('input', [
                { speaker: 'human', text: ps`Hello` },
                { speaker: 'assistant', text: ps`Hi there!` },
            ])
        ).toBe(true)
        expect(
            counter.updateUsage('user', [
                { speaker: 'human', text: ps`Here is my selected code...` },
                { speaker: 'assistant', text: ps`ok` },
                { speaker: 'human', text: ps`Here is my selected code...` },
                { speaker: 'assistant', text: ps`ok` },
            ])
        ).toBe(true)
        expect(
            counter.updateUsage('enhanced', [
                { speaker: 'human', text: ps`Here is my enhanced context...` },
                { speaker: 'assistant', text: ps`ok` },
            ])
        ).toBe(false) // Exceeds the limit
    })

    it('should return false when exceeds limits - chat and user context with seperated budget', () => {
        const counter = new TokenCounter({ input: 20, context: { user: 20 } })
        expect(counter.updateUsage('preamble', preamble)).toBe(true)
        expect(
            counter.updateUsage('input', [
                { speaker: 'human', text: ps`Hello` },
                { speaker: 'assistant', text: ps`Hi there!` },
            ])
        ).toBe(true)
        expect(
            counter.updateUsage('user', [
                { speaker: 'human', text: ps`Here is my selected code...` },
                { speaker: 'assistant', text: ps`ok` },
                { speaker: 'human', text: ps`Here is my selected code...` },
                { speaker: 'assistant', text: ps`ok` },
            ])
        ).toBe(true)
        expect(
            counter.updateUsage('enhanced', [
                { speaker: 'human', text: ps`Hi` },
                { speaker: 'assistant', text: ps`ok` },
            ])
        ).toBe(true)
        expect(
            counter.updateUsage('input', [
                { speaker: 'human', text: ps`Hello` },
                { speaker: 'assistant', text: ps`Hi there!` },
            ])
        ).toBe(true)
        expect(
            counter.updateUsage('enhanced', [
                { speaker: 'human', text: ps`This is a very long enhanced context with code` },
                { speaker: 'assistant', text: ps`limit exceeded` },
            ])
        ).toBe(false) // Exceeds the limit
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
            const text = ps`Café`
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
            expect(tokenCount).toBe(6)
        })

        it('should calculate the total token count for an array of messages', () => {
            const messages: Message[] = [
                { text: ps`Hello`, speaker: 'human' },
                { text: ps`How are you?`, speaker: 'assistant' },
                { text: ps`I am doing well, thank you.`, speaker: 'human' },
            ]
            const tokenCount = TokenCounter.getMessagesTokenCount(messages)
            expect(tokenCount).toBe(13)
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
