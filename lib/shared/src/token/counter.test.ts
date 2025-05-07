import { describe, expect, it } from 'vitest'
import { ps } from '../prompt/prompt-string'
import type { Message } from '../sourcegraph-api'
import {
    CHAT_INPUT_TOKEN_BUDGET,
    CORPUS_CONTEXT_ALLOCATION,
    EXTENDED_USER_CONTEXT_TOKEN_BUDGET,
} from './constants'
import { TokenCounter, TokenCounterUtils } from './counter'

const preamble: Message[] = [
    { speaker: 'human', text: ps`Preamble` },
    { speaker: 'assistant', text: ps`OK` },
] // uses 3 tokens

describe('TokenCounter class', () => {
    it('should initialize with the correct token budgets', async () => {
        const counter = await TokenCounter.create({ input: CHAT_INPUT_TOKEN_BUDGET, output: 0 })
        expect(counter.maxChatTokens).toBe(CHAT_INPUT_TOKEN_BUDGET)
        // Context budget will be shared with chat budget.
        expect(counter.maxContextTokens.user).toBe(CHAT_INPUT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.corpus).toBe(CHAT_INPUT_TOKEN_BUDGET * CORPUS_CONTEXT_ALLOCATION)
    })

    it('should initialize with the correct token budgets for a customized context window', async () => {
        const counter = await TokenCounter.create({ input: 1234, output: 0 })
        expect(counter.maxChatTokens).toBe(1234)
        expect(counter.maxContextTokens.user).toBe(1234)
        expect(counter.maxContextTokens.corpus).toBe(Math.floor(1234 * CORPUS_CONTEXT_ALLOCATION))
    })

    it('should initialize with the correct token budgets when user context is provided', async () => {
        const counter = await TokenCounter.create({
            input: CHAT_INPUT_TOKEN_BUDGET,
            output: 0,
            context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
        })
        expect(counter.maxChatTokens).toBe(CHAT_INPUT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.user).toBe(EXTENDED_USER_CONTEXT_TOKEN_BUDGET)
        expect(counter.maxContextTokens.corpus).toBe(CHAT_INPUT_TOKEN_BUDGET * CORPUS_CONTEXT_ALLOCATION)
    })

    it('should throw error when adding input without preamble', async () => {
        const counter = await TokenCounter.create({ input: CHAT_INPUT_TOKEN_BUDGET, output: 0 })
        expect(() => counter.updateUsage('input', [{ speaker: 'human', text: ps`Hello` }])).toThrowError(
            'Preamble must be updated before Chat input.'
        )
    })

    it('should return true when update usage within limits (sharing budget)', async () => {
        const counter = await TokenCounter.create({ input: CHAT_INPUT_TOKEN_BUDGET, output: 0 })
        expect(counter.updateUsage('preamble', preamble)).toEqual({ succeeded: true }) // 3 chat tokens needed
        const messages: Message[] = [
            // 4 chat tokens needed
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ]
        expect(CHAT_INPUT_TOKEN_BUDGET).toBeGreaterThan(3 + 4)
        // 3 + 4 chat tokens needed = within limit of CHAT_INPUT_TOKEN_BUDGET
        expect(counter.updateUsage('input', messages)).toEqual({ succeeded: true })
    })

    it('should return true when update usage within limits (separated chat & user budgets)', async () => {
        const counter = await TokenCounter.create({
            input: CHAT_INPUT_TOKEN_BUDGET,
            output: 0,
            context: { user: EXTENDED_USER_CONTEXT_TOKEN_BUDGET },
        })
        expect(counter.updateUsage('preamble', preamble)).toEqual({ succeeded: true }) // 3 chat tokens used
        expect(
            counter.updateUsage('input', [
                // 4 chat tokens needed
                { speaker: 'human', text: ps`Hello` },
                { speaker: 'assistant', text: ps`Hi there!` },
            ])
        ).toEqual({ succeeded: true })
        expect(
            counter.updateUsage('user', [{ speaker: 'system', text: ps`You are a helpful assistant.` }])
        ).toEqual({ succeeded: true })
    })

    it('should return false when token usage exceeds limits', async () => {
        const counter = await TokenCounter.create({ input: 5, output: 0 })
        expect(counter.updateUsage('preamble', preamble)).toEqual({ succeeded: true }) // 3 chat tokens needed
        const messages: Message[] = [
            // 4 chat tokens needed
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ]
        // 3 + 4 chat tokens needed -> exceeds the limit of 5
        expect(counter.updateUsage('input', messages)).toEqual({
            succeeded: false,
            reason: 'input tokens exceeded remaining chat tokens (4 > 2)',
        })
    })

    it('should return true when update usage on the limit', async () => {
        const counter = await TokenCounter.create({ input: 7, output: 0 })
        expect(counter.updateUsage('preamble', preamble)).toEqual({ succeeded: true }) // 3 chat tokens used
        const messages: Message[] = [
            // 4 chat tokens needed
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ]
        // 3 + 4 chat tokens needed = within limit of 7
        expect(counter.updateUsage('input', messages)).toEqual({ succeeded: true })
    })

    it('should throw error when trying to update context token usage before chat input', async () => {
        const counter = await TokenCounter.create({ input: 10, context: { user: 20 }, output: 0 })
        expect(counter.updateUsage('preamble', preamble)).toEqual({ succeeded: true })
        expect(() => {
            counter.updateUsage('corpus', [
                { speaker: 'human', text: ps`Hi` },
                { speaker: 'assistant', text: ps`ok` },
            ])
        }).toThrowError('Chat token usage must be updated before Context.')

        expect(() => {
            counter.updateUsage('user', [
                { speaker: 'human', text: ps`Hi` },
                { speaker: 'assistant', text: ps`ok` },
            ])
        }).toThrowError('Chat token usage must be updated before Context.')
    })

    it('should return false when exceeds limits (sharing budget)', async () => {
        const counter = await TokenCounter.create({ input: 30, output: 0 })
        expect(counter.utils.getMessagesTokenCount(preamble)).toBe(3)
        expect(counter.updateUsage('preamble', preamble)).toEqual({ succeeded: true })
        // Remaining tokens: 30 - 3 = 27

        const chatInputMessages = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ] as Message[]
        expect(counter.utils.getMessagesTokenCount(chatInputMessages)).toBe(4)
        expect(counter.updateUsage('input', chatInputMessages)).toEqual({ succeeded: true })
        // Remaining tokens: 30 - 3 - 4 = 23

        const userContextMessages = [
            { speaker: 'human', text: ps`Here is my selected code...` },
            { speaker: 'assistant', text: ps`ok` },
            { speaker: 'human', text: ps`Here is my selected code...` },
            { speaker: 'assistant', text: ps`ok` },
        ] as Message[]
        expect(counter.utils.getMessagesTokenCount(userContextMessages)).toBe(14)
        expect(counter.updateUsage('user', userContextMessages)).toEqual({ succeeded: true })
        // ADDED: Remaining tokens: 30 - 3 - 4 - 14 = 9

        // Enhanced Token Budget: 9 * 0.6 = Round down to 5
        // - the remaining chat token budget * CORPUS_CONTEXT_ALLOCATION
        const corpusContextMessages = [
            { speaker: 'human', text: ps`Here is my corpus context...` },
            { speaker: 'assistant', text: ps`ok` },
        ] as Message[]
        expect(counter.utils.getMessagesTokenCount(corpusContextMessages)).toBe(7)
        expect(counter.updateUsage('corpus', corpusContextMessages)).toEqual({
            succeeded: false,
            reason: 'corpus context tokens exceeded remaining corpus context tokens (7 > 5)',
        })
        // FAILED: 7 tokens needed, exceeds the remaining token budget of 5 for corpus context

        const fiveTokensMessages = [
            { speaker: 'human', text: ps`Need 5 tokens` },
            { speaker: 'assistant', text: ps`ok` },
        ] as Message[]
        expect(counter.utils.getMessagesTokenCount(fiveTokensMessages)).toBe(5)
        expect(counter.updateUsage('corpus', fiveTokensMessages)).toEqual({ succeeded: true })
        // ADDED: 5 tokens needed, within the remaining token budget of 5
    })

    it('should be able to add messages for message types that have tokens left', async () => {
        const counter = await TokenCounter.create({ input: 20, context: { user: 20 }, output: 0 })
        expect(counter.updateUsage('preamble', preamble)).toEqual({ succeeded: true })
        // ADDED: Remaining input tokens: 20 - 3 = 17 & Remaining user tokens: 20

        const greetings = [
            { speaker: 'human', text: ps`Hello` },
            { speaker: 'assistant', text: ps`Hi there!` },
        ] as Message[] // 4 tokens needed
        expect(counter.utils.getMessagesTokenCount(greetings)).toBe(4)
        expect(counter.updateUsage('input', greetings)).toEqual({ succeeded: true })
        // ADDED: Remaining input tokens: 17 - 4 = 13 & Remaining user tokens: 20

        expect(
            counter.updateUsage('user', [
                { speaker: 'human', text: ps`Here is my selected code...` },
                { speaker: 'assistant', text: ps`ok` },
                { speaker: 'human', text: ps`Here is my selected code...` },
                { speaker: 'assistant', text: ps`ok` },
            ])
        ).toEqual({ succeeded: true })
        // ADDED: Remaining input tokens: 13 & Remaining user tokens: 20 - 14 = 6

        const shortMessages = [
            { speaker: 'human', text: ps`Hi` },
            { speaker: 'assistant', text: ps`ok` },
        ] as Message[]
        expect(counter.utils.getMessagesTokenCount(shortMessages)).toBe(2)
        expect(counter.updateUsage('corpus', shortMessages)).toEqual({ succeeded: true })
        // ADDED: Remaining input tokens: 13 - 2 = 11 & Remaining user tokens: 6

        expect(counter.updateUsage('input', greetings)).toEqual({ succeeded: true })
        // ADDED: Remaining input tokens: 11 - 4 = 7 &  Remaining user tokens: 6

        const longMessages = [
            { speaker: 'human', text: ps`This is a very long corpus context with code` },
            { speaker: 'assistant', text: ps`limit exceeded` },
        ] as Message[]
        // 11 exceeds the limit of the Enhanced Token Budget (7 * 0.6 = Round down to 4)
        expect(counter.utils.getMessagesTokenCount(longMessages)).toBe(11)
        expect(counter.updateUsage('corpus', longMessages)).toEqual({
            succeeded: false,
            reason: 'corpus context tokens exceeded remaining corpus context tokens (11 > 5)',
        })
        // FAILED: Remaining input tokens: 7 & Remaining user tokens: 6

        // Can add more messages to input and user context when there are remaining token budgets
        expect(counter.updateUsage('input', greetings)).toEqual({ succeeded: true })
        // ADDED: Remaining input tokens: 7 - 4 = 3 & Remaining user tokens: 6

        expect(counter.updateUsage('user', greetings)).toEqual({ succeeded: true })
        // ADDED: Remaining input tokens: 3 & Remaining user tokens: 6 - 4 = 2

        expect(counter.updateUsage('corpus', greetings)).toEqual({
            succeeded: false,
            reason: 'corpus context tokens exceeded remaining corpus context tokens (4 > 3)',
        })
        // FAILED: Remaining input tokens: 3 & Remaining user tokens: 2
        // - because corpus context only has 3 * 0.6 = 2 tokens left
    })
})

describe('TokenCounter static', () => {
    //  NOTE: Token counts are from https://platform.openai.com/tokenizer
    describe('countTokens', () => {
        it.each([
            ['This is a sample text.', 6],
            ['Hello, world! 🌍', 7],
            ['Café', 3],
            ['/path/to/file.go', 4],
            ['/path/to/node_modules/file_test.ts', 7],
            ['@/path/to/fileTest.js', 7],
            ['file.rb', 2],
            ['contest.ts', 2],
            ['😀 😄 😁 😆 😅 🤣', 13],
            ['   \n\t\r', 3],
            [' ', 1],
            ['こんにちは', 1],
            ['友人', 2],
            ['朋友', 3],
        ])('for string %j has %j tokens', async (text, test) => {
            expect(await TokenCounterUtils.countTokens(text)).toBe(test)
        })
    })

    describe('countPromptString', () => {
        it('should count the tokens in a given text', async () => {
            const text = ps`This is a sample text.`
            const tokenCount = await TokenCounterUtils.countPromptString(text)
            expect(tokenCount).toBe(6)
        })

        it('should handle text with special characters', async () => {
            const text = ps`Hello, world! 🌍`
            const tokenCount = await TokenCounterUtils.countPromptString(text)
            expect(tokenCount).toBe(7)
        })

        it('should normalize the text to NFKC before counting tokens', async () => {
            const text = ps`Café`
            const tokenCount = await TokenCounterUtils.countPromptString(text)
            expect(tokenCount).toBe(3)
        })

        it('should handle text with emojis', async () => {
            const text = ps`😀 😄 😁 😆 😅 🤣`
            const tokenCount = await TokenCounterUtils.countPromptString(text)
            expect(tokenCount).toBe(13)
        })

        it('should handle strings with only whitespace characters', async () => {
            const text = ps`   \n\t\r`
            const tokenCount = await TokenCounterUtils.countPromptString(text)
            expect(tokenCount).toBe(3)
        })

        it('should handle non-English strings', async () => {
            const text = ps`こんにちは`
            const tokenCount = await TokenCounterUtils.countPromptString(text)
            expect(tokenCount).toBe(1)
        })
    })

    describe('getMessagesTokenCount', () => {
        it('should count the tokens in a message', async () => {
            const message: Message = {
                text: ps`This is a sample message.`,
                speaker: 'human',
            }
            const tokenCount = await TokenCounterUtils.getMessagesTokenCount([message])
            expect(tokenCount).toBe(6)
        })

        it('should calculate the total token count for an array of messages', async () => {
            const messages: Message[] = [
                { text: ps`Hello`, speaker: 'human' },
                { text: ps`How are you?`, speaker: 'assistant' },
                { text: ps`I am doing well, thank you.`, speaker: 'human' },
            ]
            const tokenCount = await TokenCounterUtils.getMessagesTokenCount(messages)
            expect(tokenCount).toBe(13)
        })

        it('should return 0 for an empty array of messages', async () => {
            const messages: Message[] = []
            const tokenCount = await TokenCounterUtils.getMessagesTokenCount(messages)
            expect(tokenCount).toBe(0)
        })
    })
})
