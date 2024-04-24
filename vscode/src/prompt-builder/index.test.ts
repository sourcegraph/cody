import { describe, expect, it } from 'vitest'

import path from 'node:path'
import type { ContextItem, ContextMessage, Message } from '@sourcegraph/cody-shared'
import { type ChatMessage, ContextItemSource, ps } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { PromptBuilder } from './index'

describe('PromptBuilder', () => {
    const preamble: Message[] = [{ speaker: 'system', text: ps`preamble` }]
    describe('tryAddMessages', () => {
        it('throws error when tryAddMessages before tryAddPrefix', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            const transcript: ChatMessage[] = [{ speaker: 'human', text: ps`Hi!` }]
            expect(() => builder.tryAddMessages(transcript.reverse())).toThrowError()
        })

        it('adds single valid transcript', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            const transcript: ChatMessage[] = [{ speaker: 'human', text: ps`Hi!` }]
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages(transcript.reverse())
            const messages = builder.build()
            expect(messages.length).toBe(2)
            expect(messages[0].speaker).toBe('system')
            expect(messages[1].speaker).toBe('human')
        })

        it('throw on transcript starts with assistant', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            const transcript: ChatMessage[] = [{ speaker: 'assistant', text: ps`Hi!` }]
            builder.tryAddToPrefix(preamble)
            expect(() => {
                builder.tryAddMessages(transcript)
            }).toThrowError()
        })

        it('adds valid transcript in reverse order', () => {
            const builder = new PromptBuilder({ input: 1000, output: 100 })
            const transcript: ChatMessage[] = [
                { speaker: 'human', text: ps`Hi assistant!` },
                { speaker: 'assistant', text: ps`Hello there!` },
                { speaker: 'human', text: ps`Hi again!` },
                { speaker: 'assistant', text: ps`Hello there again!` },
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
            const builder = new PromptBuilder({ input: 1000, output: 100 })
            const invalidTranscript: ChatMessage[] = [
                { speaker: 'human', text: ps`Hi there!` },
                { speaker: 'human', text: ps`Hello there!` },
                { speaker: 'assistant', text: ps`How are you?` },
                { speaker: 'assistant', text: ps`Hello there!` },
            ]
            builder.tryAddToPrefix(preamble)
            expect(() => {
                builder.tryAddMessages(invalidTranscript)
            }).toThrowError()
        })

        it('throws on transcript with human speakers only', () => {
            const builder = new PromptBuilder({ input: 1000, output: 100 })
            const invalidTranscript: ChatMessage[] = [
                { speaker: 'human', text: ps`1` },
                { speaker: 'human', text: ps`2` },
                { speaker: 'human', text: ps`3` },
                { speaker: 'human', text: ps`4` },
            ]
            builder.tryAddToPrefix(preamble)
            expect(() => {
                builder.tryAddMessages(invalidTranscript)
            }).toThrowError()
        })

        it('stops adding message-pairs when limit has been reached', () => {
            const builder = new PromptBuilder({ input: 20, output: 100 })
            builder.tryAddToPrefix(preamble)
            const longTranscript: ChatMessage[] = [
                { speaker: 'human', text: ps`Hi assistant!` },
                { speaker: 'assistant', text: ps`Hello there!` },
                { speaker: 'human', text: ps`Hi again!` },
                {
                    speaker: 'assistant',
                    text: ps`This is a very long message that should exceed the character limit`,
                },
                // Only this message should be added
                { speaker: 'human', text: ps`Only this message should be added as messages.` },
            ]
            const numberOfMessagesIgnored = builder.tryAddMessages(longTranscript.reverse())
            expect(numberOfMessagesIgnored).toBe(4)
            const messages = builder.build()
            expect(messages.length).toBe(2)
        })
    })

    describe('tryAddMessages', () => {
        it('throws error when trying to add Enhanced Context before chat input', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            builder.tryAddToPrefix(preamble)
            const file: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
            }
            const transcript: ContextMessage[] = [{ speaker: 'human', file, text: ps`` }]
            expect(() => builder.tryAddContext('enhanced', transcript.reverse())).toThrowError()
        })

        it('throws error when trying to add User Context before chat input', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            builder.tryAddToPrefix(preamble)
            const file: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
            }
            const transcript: ContextMessage[] = [{ speaker: 'human', file, text: ps`` }]
            expect(() => builder.tryAddContext('user', transcript.reverse())).toThrowError()
        })
    })

    describe('getContextItemId', () => {
        it('returns display file path for non-unified context items without range', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar.js'),
                content: 'foobar',
                size: 100,
                source: ContextItemSource.User,
            }
            const id = builder.getContextItemId(item)
            expect(id).toBe(getPlatformSlashes('foo/bar.js'))
        })

        it('returns display file path with line range for context items with range', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar.js'),
                content: 'foobar',
                size: 100,
                range: { start: { line: 2, character: 0 }, end: { line: 5, character: 10 } },
                source: ContextItemSource.User,
            }
            const id = builder.getContextItemId(item)
            expect(id).toBe(getPlatformSlashes('foo/bar.js#2:5'))
        })

        it('returns title for unified context items without range', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            const item: ContextItem = {
                type: 'file',
                uri: URI.parse('https://example.com/foo/bar.js'),
                content: 'foobar',
                size: 100,
                title: 'foo/bar.js',
                source: ContextItemSource.Unified,
            }
            const id = builder.getContextItemId(item)
            expect(id).toBe('foo/bar.js')
        })

        it('returns title with line range for unified context items with range', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            const item: ContextItem = {
                type: 'file',
                uri: URI.parse('https://example.com/foo/bar.js'),
                content: 'foobar',
                size: 100,
                title: 'foo/bar.js',
                range: { start: { line: 2, character: 0 }, end: { line: 5, character: 10 } },
                source: ContextItemSource.Unified,
            }
            const id = builder.getContextItemId(item)
            expect(id).toBe('foo/bar.js#2:5')
        })

        it('handles range values serialized from vscode.Range', () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar.js'),
                content: 'foobar',
                size: 100,
                range: { start: { line: 2, character: 0 }, end: { line: 5, character: 10 } },
                source: ContextItemSource.User,
            }
            const id = builder.getContextItemId(item)
            expect(id).toBe(getPlatformSlashes('foo/bar.js#2:5'))
        })
    })
})

function getPlatformSlashes(input: string) {
    return input.replaceAll(path.posix.sep, path.sep)
}
