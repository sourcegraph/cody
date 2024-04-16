import { describe, expect, it } from 'vitest'

import type { ChatMessage, ContextItem, ContextMessage, Message } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { PromptBuilder } from './index'

describe('PromptBuilder', () => {
    const preamble: Message[] = [{ speaker: 'system', text: 'Hi!' }]
    describe('tryAddMessages', () => {
        it('throws error when tryAddMessages before tryAddPrefix', () => {
            const builder = new PromptBuilder({ input: 100 })
            const transcript: ChatMessage[] = [{ speaker: 'human', text: 'Hi!' }]
            expect(() => builder.tryAddMessages(transcript.reverse())).toThrowError()
        })

        it('adds single valid transcript', () => {
            const builder = new PromptBuilder({ input: 100 })
            const transcript: ChatMessage[] = [{ speaker: 'human', text: 'Hi!' }]
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages(transcript.reverse())
            const messages = builder.build()
            expect(messages.length).toBe(2)
            expect(messages[0].speaker).toBe('system')
            expect(messages[1].speaker).toBe('human')
        })

        it('throw on transcript starts with assistant', () => {
            const builder = new PromptBuilder({ input: 100 })
            const transcript: ChatMessage[] = [{ speaker: 'assistant', text: 'Hi!' }]
            builder.tryAddToPrefix(preamble)
            expect(() => {
                builder.tryAddMessages(transcript)
            }).toThrowError()
        })

        it('adds valid transcript in reverse order', () => {
            const builder = new PromptBuilder({ input: 1000 })
            const transcript: ChatMessage[] = [
                { speaker: 'human', text: 'Hi assistant!' },
                { speaker: 'assistant', text: 'Hello there!' },
                { speaker: 'human', text: 'Hi again!' },
                { speaker: 'assistant', text: 'Hello there again!' },
            ]
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages(transcript.reverse())
            const messages = builder.build()
            expect(messages.length).toBe(5)
            expect(messages[0].speaker).toBe('system')
            expect(messages[1].speaker).toBe('human')
            expect(messages[1].speaker === messages[3].speaker).toBeTruthy()
            expect(messages[2].speaker).toBe('assistant')
            expect(messages[2].speaker === messages[4].speaker).toBeTruthy()
        })

        it('throws on consecutive speakers order', () => {
            const builder = new PromptBuilder({ input: 1000 })
            const invalidTranscript: ChatMessage[] = [
                { speaker: 'human', text: 'Hi there!' },
                { speaker: 'human', text: 'Hello there!' },
                { speaker: 'assistant', text: 'How are you?' },
                { speaker: 'assistant', text: 'Hello there!' },
            ]
            builder.tryAddToPrefix(preamble)
            expect(() => {
                builder.tryAddMessages(invalidTranscript)
            }).toThrowError()
        })

        it('throws on transcript with human speakers only', () => {
            const builder = new PromptBuilder({ input: 1000 })
            const invalidTranscript: ChatMessage[] = [
                { speaker: 'human', text: '1' },
                { speaker: 'human', text: '2' },
                { speaker: 'human', text: '3' },
                { speaker: 'human', text: '4' },
            ]
            builder.tryAddToPrefix(preamble)
            expect(() => {
                builder.tryAddMessages(invalidTranscript)
            }).toThrowError()
        })

        it('stops adding message-pairs when limit has been reached', () => {
            const builder = new PromptBuilder({ input: 20 })
            builder.tryAddToPrefix(preamble)
            const longTranscript: ChatMessage[] = [
                { speaker: 'human', text: 'Hi assistant!' },
                { speaker: 'assistant', text: 'Hello there!' },
                { speaker: 'human', text: 'Hi again!' },
                {
                    speaker: 'assistant',
                    text: 'This is a very long message that should exceed the character limit',
                },
                { speaker: 'human', text: 'Only this message should be added as messages.' },
            ]
            const numberOfMessagesIgnored = builder.tryAddMessages(longTranscript.reverse())
            expect(numberOfMessagesIgnored).toBe(4)
            const messages = builder.build()
            expect(messages.length).toBe(2)
        })
    })

    describe('tryAddMessages', () => {
        it('throws error when trying to add Enhanced Context before chat input', () => {
            const builder = new PromptBuilder({ input: 100 })
            builder.tryAddToPrefix(preamble)
            const file: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
            }
            const transcript: ContextMessage[] = [{ speaker: 'human', file, text: '' }]
            expect(() => builder.tryAddContext('enhanced', transcript.reverse())).toThrowError()
        })

        it('throws error when trying to add User Context before chat input', () => {
            const builder = new PromptBuilder({ input: 100 })
            builder.tryAddToPrefix(preamble)
            const file: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
            }
            const transcript: ContextMessage[] = [{ speaker: 'human', file, text: '' }]
            expect(() => builder.tryAddContext('user', transcript.reverse())).toThrowError()
        })
    })
})
