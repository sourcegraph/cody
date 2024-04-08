import { describe, expect, it } from 'vitest'
import type { Message } from '../sourcegraph-api'
import { TokenCounter } from './index'

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
    })

    describe('getMessagesByteCount', () => {
        it('should calculate the total byte count for an array of messages', () => {
            const messages: Message[] = [
                { text: 'Hello', speaker: 'human' },
                { text: 'How are you?', speaker: 'assistant' },
                { text: 'I am doing well, thank you.', speaker: 'human' },
            ]
            const byteCount = TokenCounter.getMessagesByteCount(messages)
            expect(byteCount).toBe(64)
        })

        it('should return 0 for an empty array of messages', () => {
            const messages: Message[] = []
            const byteCount = TokenCounter.getMessagesByteCount(messages)
            expect(byteCount).toBe(0)
        })
    })
})
