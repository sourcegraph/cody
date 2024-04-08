import { describe, expect, it } from 'vitest'

import { type ChatMessage, TokenCounter } from '@sourcegraph/cody-shared'
import { PromptBuilder } from './index'

describe('PromptBuilder', () => {
    describe('tryAddMessages', () => {
        it('adds single valid transcript', () => {
            const builder = new PromptBuilder(new TokenCounter(100))
            const transcript: ChatMessage[] = [{ speaker: 'human', text: 'Hi!' }]
            builder.tryAddMessages(transcript.reverse())
            const messages = builder.build()
            expect(messages.length).toBe(1)
            expect(messages[0].speaker).toBe('human')
        })

        it('throw on transcript starts with assistant', () => {
            const builder = new PromptBuilder(new TokenCounter(100))
            const transcript: ChatMessage[] = [{ speaker: 'assistant', text: 'Hi!' }]
            expect(() => {
                builder.tryAddMessages(transcript)
            }).toThrowError()
        })

        it('adds valid transcript in reverse order', () => {
            const builder = new PromptBuilder(new TokenCounter(1000))
            const transcript: ChatMessage[] = [
                { speaker: 'human', text: 'Hi assistant!' },
                { speaker: 'assistant', text: 'Hello there!' },
                { speaker: 'human', text: 'Hi again!' },
                { speaker: 'assistant', text: 'Hello there again!' },
            ]
            builder.tryAddMessages(transcript.reverse())
            const messages = builder.build()
            expect(messages.length).toBe(4)
            expect(messages[0].speaker).toBe('human')
            expect(messages[0].speaker === messages[2].speaker).toBeTruthy()
            expect(messages[1].speaker).toBe('assistant')
            expect(messages[1].speaker === messages[3].speaker).toBeTruthy()
        })

        it('throws on consecutive speakers order', () => {
            const builder = new PromptBuilder(new TokenCounter(1000))
            const invalidTranscript: ChatMessage[] = [
                { speaker: 'human', text: 'Hi there!' },
                { speaker: 'human', text: 'Hello there!' },
                { speaker: 'assistant', text: 'How are you?' },
                { speaker: 'assistant', text: 'Hello there!' },
            ]
            expect(() => {
                builder.tryAddMessages(invalidTranscript)
            }).toThrowError()
        })

        it('throws on transcript with human speakers only', () => {
            const builder = new PromptBuilder(new TokenCounter(1000))
            const invalidTranscript: ChatMessage[] = [
                { speaker: 'human', text: '1' },
                { speaker: 'human', text: '2' },
                { speaker: 'human', text: '3' },
                { speaker: 'human', text: '4' },
            ]
            expect(() => {
                builder.tryAddMessages(invalidTranscript)
            }).toThrowError()
        })

        it('stops adding message-pairs when limit has been reached', () => {
            const builder = new PromptBuilder(new TokenCounter(30))
            const longTranscript: ChatMessage[] = [
                { speaker: 'human', text: 'Hi assistant!' },
                { speaker: 'assistant', text: 'Hello there!' },
                { speaker: 'human', text: 'Hi again!' },
                {
                    speaker: 'assistant',
                    text: 'This is a very long message that should exceed the character limit',
                },
                // Only this message should be added
                { speaker: 'human', text: 'This should be added.' },
            ]
            const numberOfMessagesIgnored = builder.tryAddMessages(longTranscript.reverse())
            expect(numberOfMessagesIgnored).toBe(4)
            const messages = builder.build()
            expect(messages.length).toBe(1)
        })
    })
})
