import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContextItem, Message } from '@sourcegraph/cody-shared'
import {
    type ChatMessage,
    ContextItemSource,
    contextFiltersProvider,
    displayPath,
    ps,
} from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { PromptBuilder } from './index'

describe('PromptBuilder', () => {
    beforeEach(() => {
        vi.spyOn(contextFiltersProvider.instance!, 'isUriIgnored').mockResolvedValue(false)
    })

    const preamble: Message[] = [{ speaker: 'system', text: ps`preamble` }]

    it('throws an error when trying to add corpus context before chat input', async () => {
        const builder = await PromptBuilder.create({ input: 100, output: 100 })
        builder.tryAddToPrefix(preamble)
        const file: ContextItem = {
            type: 'file',
            uri: URI.file('/foo/bar'),
            content: 'foobar',
            size: 100,
        }
        expect(() => builder.tryAddContext('corpus', [file])).rejects.toThrowError()
    })

    it('throws an error when trying to add User Context before chat input', async () => {
        const builder = await PromptBuilder.create({ input: 100, output: 100 })
        builder.tryAddToPrefix(preamble)
        const file: ContextItem = {
            type: 'file',
            uri: URI.file('/foo/bar'),
            content: 'foobar',
            size: 100,
        }
        expect(() => builder.tryAddContext('user', [file])).rejects.toThrowError()
    })

    describe('tryAddToPrefix', async () => {
        it('should add messages to prefix if within token limit', async () => {
            const builder = await PromptBuilder.create({ input: 20, output: 100 })
            const preambleTranscript: ChatMessage[] = [{ speaker: 'human', text: ps`Hi!` }]

            expect(builder.tryAddToPrefix(preambleTranscript)).toBe(true)
            expect(builder.build()).toEqual(preambleTranscript)
            // expect(mockUpdateUsage).toHaveBeenCalledWith('preamble', messages)
        })

        it('should not add messages to prefix if not within token limit', async () => {
            const builder = await PromptBuilder.create({ input: 1, output: 100 })
            const preambleTranscript: ChatMessage[] = [{ speaker: 'human', text: ps`Hi!` }]

            expect(builder.tryAddToPrefix(preambleTranscript)).toBe(false)
            expect(builder.build()).toEqual([])
        })
    })

    describe('tryAddMessages', async () => {
        it('throws error when tryAddMessages before tryAddPrefix', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 100 })
            const transcript: ChatMessage[] = [{ speaker: 'human', text: ps`Hi!` }]
            expect(() => builder.tryAddMessages(transcript.reverse())).toThrowError()
        })

        it('adds single valid transcript', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 100 })
            const transcript: ChatMessage[] = [{ speaker: 'human', text: ps`Hi!` }]
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages(transcript.reverse())
            const messages = builder.build()
            expect(messages.length).toBe(2)
            expect(messages[0].speaker).toBe('system')
            expect(messages[1].speaker).toBe('human')
        })

        it('throw on transcript starts with assistant', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 100 })
            const transcript: ChatMessage[] = [{ speaker: 'assistant', text: ps`Hi!` }]
            builder.tryAddToPrefix(preamble)
            expect(() => {
                builder.tryAddMessages(transcript)
            }).toThrowError()
        })

        it('adds valid transcript in reverse order', async () => {
            const builder = await PromptBuilder.create({ input: 1000, output: 100 })
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

        it('throws on consecutive speakers order', async () => {
            const builder = await PromptBuilder.create({ input: 1000, output: 100 })
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

        it('throws on transcript with human speakers only', async () => {
            const builder = await PromptBuilder.create({ input: 1000, output: 100 })
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

        it('stops adding message-pairs when limit has been reached', async () => {
            const builder = await PromptBuilder.create({ input: 20, output: 100 })
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

    describe('tryAddContext', async () => {
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

        it('should not allow context prompt to exceed context window', async () => {
            const builder = await PromptBuilder.create({ input: 10, output: 100 })
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

            const { limitReached, ignored } = await builder.tryAddContext('corpus', contextItems)
            expect(limitReached).toBeTruthy()
            expect(ignored).toEqual(contextItems)
            expect(builder.contextItems).toEqual([])

            const prompt = builder.build()
            expect(prompt).toEqual([...preamble, ...chatTranscript])
        })

        it('should not contain duplicated context', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 100 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const file: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } },
                source: ContextItemSource.User,
            }

            // Context should only be added once even when provided twice.
            await builder.tryAddContext('user', [file, file])
            expect(builder.contextItems.length).toBe(1)
        })

        it('should not contain non-unique context (context with overlapping ranges)', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 100 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const innerRange: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } },
                source: ContextItemSource.User,
            }

            const outerRange: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } },
                source: ContextItemSource.User,
            }
            await builder.tryAddContext('user', [innerRange, outerRange])
            expect(builder.contextItems.length).toBe(1)
            expect(builder.contextItems).toStrictEqual([outerRange])
        })

        it('should not contain context that is too large', async () => {
            const builder = await PromptBuilder.create({ input: 50, output: 50 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const innerRange: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 1, character: 0 }, end: { line: 2, character: 1 } },
                source: ContextItemSource.Embeddings,
            }

            const outerRange: ContextItem = {
                ...fileWithSameUri,
                size: 100,
                content: 'This is a file that exceeds the token limit',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 1 } },
                source: ContextItemSource.Search,
                isTooLarge: true,
            }

            const { limitReached, ignored } = await builder.tryAddContext('corpus', [
                innerRange,
                outerRange,
                innerRange,
            ])

            // Outer range should be ignored because it exceeds the token limit,
            // and should not be added to the final context items list.
            expect(limitReached).toBeTruthy()
            expect(ignored).toEqual([outerRange])
            expect(builder.contextItems).toStrictEqual([innerRange])
        })

        it('should remove context with overlapping ranges when full file is provided', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 50 })
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

            const { limitReached } = await builder.tryAddContext('user', [
                partialFile,
                fullFile,
                partialFile,
            ])
            expect(limitReached).toBeFalsy()
            expect(builder.contextItems).toStrictEqual([fullFile])
        })

        it('should not remove user-added with overlapping ranges even when full file is provided', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 50 })
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

            const { limitReached } = await builder.tryAddContext('user', [
                selection,
                fullFile,
                selection,
            ])
            expect(limitReached).toBeFalsy()
            expect(builder.contextItems).toStrictEqual([selection, fullFile])
        })

        it('should deduplicate context from different token usage types', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 50 })
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

            const user = await builder.tryAddContext('user', [selection])
            expect(builder.contextItems).toStrictEqual([selection])
            expect(user.limitReached).toBeFalsy()
            expect(user.added).toStrictEqual([selection])

            const history = await builder.tryAddContext('history', [fullFile])
            expect(history.limitReached).toBeFalsy()
            expect(history.added).toStrictEqual([fullFile])

            const corpus = await builder.tryAddContext('corpus', [selection, fullFile])
            expect(corpus.limitReached).toBeFalsy()
            expect(corpus.added).toStrictEqual([])

            // The final context items should only contain the selection and full file.
            expect(builder.contextItems).toStrictEqual([selection, fullFile])
        })

        it('preserves context items content', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 100 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const file: ContextItem = {
                ...fileWithSameUri,
                range: { start: { line: 0, character: 0 }, end: { line: 1, character: 1 } },
                source: ContextItemSource.User,
            }

            // Context should only be added once even when provided twice.
            await builder.tryAddContext('user', [file, file])
            const promptContent = builder
                .build()
                .map(item => item.text)
                .join('\n')

            expect(builder.contextItems.length).toBe(1)
            expect(promptContent).toMatchInlineSnapshot(`
              "preamble
              Codebase context from file ${displayPath(file.uri)}:
              \`\`\`go:${displayPath(file.uri)}
              foo\`\`\`
              Ok.
              Hi!
              Hi!"
            `)
        })
    })
})
