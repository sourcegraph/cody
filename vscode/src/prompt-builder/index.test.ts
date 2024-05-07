import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContextItem, ContextMessage, Message } from '@sourcegraph/cody-shared'
import {
    type ChatMessage,
    ContextItemSource,
    contextFiltersProvider,
    ps,
} from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { PromptBuilder } from './index'

describe('PromptBuilder', () => {
    beforeEach(() => {
        vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)
    })

    const preamble: Message[] = [{ speaker: 'system', text: ps`preamble` }]

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
        expect(() => builder.tryAddContext('enhanced', transcript.reverse())).rejects.toThrowError()
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
        expect(() => builder.tryAddContext('user', transcript.reverse())).rejects.toThrowError()
    })

    describe('tryAddToPrefix', () => {
        it('should add messages to prefix if within token limit', () => {
            const builder = new PromptBuilder({ input: 20, output: 100 })
            const preambleTranscript: ChatMessage[] = [{ speaker: 'human', text: ps`Hi!` }]

            expect(builder.tryAddToPrefix(preambleTranscript)).toBe(true)
            expect(builder.build()).toEqual(preambleTranscript)
            // expect(mockUpdateUsage).toHaveBeenCalledWith('preamble', messages)
        })

        it('should not add messages to prefix if not within token limit', () => {
            const builder = new PromptBuilder({ input: 1, output: 100 })
            const preambleTranscript: ChatMessage[] = [{ speaker: 'human', text: ps`Hi!` }]

            expect(builder.tryAddToPrefix(preambleTranscript)).toBe(false)
            expect(builder.build()).toEqual([])
        })
    })

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

    describe('tryAddContext', () => {
        const chatTranscript: Message[] = [
            { speaker: 'human', text: ps`Hi!` },
            { speaker: 'assistant', text: ps`Hi!` },
        ]

        const fileWithSameUri: ContextItem = {
            type: 'file',
            uri: URI.file('/foo/bar.go'),
            size: 1,
            content: 'foo',
        }

        function generateContextTranscript(contextItems: ContextItem[]): ContextMessage[] {
            return contextItems.map(file => ({ speaker: 'human', file, text: ps`` }))
        }

        it('should not allow context prompt to exceed context window', async () => {
            const builder = new PromptBuilder({ input: 10, output: 100 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const contextItems: ContextItem[] = [
                {
                    ...fileWithSameUri,
                    content: 'This is a file that exceeds the token limit',
                    isTooLarge: true,
                    size: 20,
                },
            ]

            const { limitReached, ignored } = await builder.tryAddContext('enhanced', contextItems)
            expect(limitReached).toBeTruthy()
            expect(ignored).toEqual(contextItems)
            expect(builder.contextItems).toEqual([])

            const prompt = builder.build()
            expect(prompt).toEqual([...preamble, ...chatTranscript])
        })

        it('should not contains duplicated context', async () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const file: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } },
                source: ContextItemSource.User,
            }

            // Context should onlt be added once even when provided twice.
            const contextTranscript = generateContextTranscript([file, file])
            await builder.tryAddContext('user', contextTranscript.reverse())
            expect(builder.contextItems.length).toBe(1)
        })

        it('should not contains non-unique context (context with overlapping ranges)', async () => {
            const builder = new PromptBuilder({ input: 100, output: 100 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const innerRange: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } },
                source: ContextItemSource.User,
            }

            const outterRange: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } },
                source: ContextItemSource.User,
            }
            const contextTranscript = generateContextTranscript([innerRange, outterRange])
            await builder.tryAddContext('user', contextTranscript.reverse())
            expect(builder.contextItems.length).toBe(1)
            expect(builder.contextItems).toStrictEqual([outterRange])
        })

        it('should not contains context that is too large', async () => {
            const builder = new PromptBuilder({ input: 10, output: 10 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const innerRange: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 1, character: 0 }, end: { line: 2, character: 1 } },
                source: ContextItemSource.Embeddings,
            }

            const outterRange: ContextItem = {
                ...fileWithSameUri,
                size: 100,
                content: 'This is a file that exceeds the token limit',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } },
                source: ContextItemSource.Search,
                isTooLarge: true,
            }

            const contextTranscript = generateContextTranscript([innerRange, outterRange, innerRange])
            const { limitReached, ignored } = await builder.tryAddContext('enhanced', contextTranscript)
            // Outter range should be ignored because it exceeds the token limit,
            // and should not be added to the final context items list.
            expect(limitReached).toBeTruthy()
            expect(ignored).toEqual([outterRange])
            expect(builder.contextItems).toStrictEqual([innerRange])
        })

        it('should remove context with overlapping ranges when full file is provided', async () => {
            const builder = new PromptBuilder({ input: 10, output: 10 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const partialFile: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 1, character: 0 }, end: { line: 2, character: 1 } },
                source: ContextItemSource.Embeddings,
            }

            const fullFile: ContextItem = {
                ...fileWithSameUri,
                size: 2,
                content: 'This has full file content.',
                source: ContextItemSource.User,
                isTooLarge: true,
            }

            const contextTranscript = generateContextTranscript([partialFile, fullFile, partialFile])
            const { limitReached } = await builder.tryAddContext('user', contextTranscript)
            expect(limitReached).toBeFalsy()
            expect(builder.contextItems).toStrictEqual([fullFile])
        })

        it('should not remove user-added with overlapping ranges even when full file is provided', async () => {
            const builder = new PromptBuilder({ input: 10, output: 10 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const selection: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 1, character: 0 }, end: { line: 2, character: 1 } },
                source: ContextItemSource.Selection,
            }

            const fullFile: ContextItem = {
                ...fileWithSameUri,
                size: 2,
                content: 'This has full file content.',
                source: ContextItemSource.User,
                isTooLarge: true,
            }

            const contextTranscript = generateContextTranscript([selection, fullFile, selection])
            const { limitReached } = await builder.tryAddContext('user', contextTranscript)
            expect(limitReached).toBeFalsy()
            expect(builder.contextItems).toStrictEqual([selection, fullFile])
        })
    })
})
