import type { ContextItem, ContextItemMedia, Message } from '@sourcegraph/cody-shared'
import {
    type ChatMessage,
    ContextItemSource,
    contextFiltersProvider,
    displayPath,
    featureFlagProvider,
    ps,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { mockLocalStorage } from '../services/LocalStorageProvider'
import { PromptBuilder } from './index'

describe('PromptBuilder', () => {
    beforeEach(() => {
        mockLocalStorage()
        vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)
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

        it('should correctly add media context items to the final messages', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 100 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const imageItem: ContextItem = {
                type: 'media',
                uri: URI.file('/foo/image.png'),
                size: 1,
                content: 'image data',
                data: 'data:image/png;base64,iVBORw0KGgoAAA==',
                mimeType: 'image/png',
                filename: 'image.png',
                source: ContextItemSource.User,
            }

            const { added, ignored, limitReached } = await builder.tryAddContext('user', [imageItem])

            // Verify the media item was added successfully
            expect(limitReached).toBe(false)
            expect(ignored).toEqual([])
            expect(added).toEqual([imageItem])
            expect(builder.contextItems).toEqual([imageItem])

            // Build the final messages and check that the media content is included correctly
            const finalMessages = builder.build()

            // Find the media message
            const mediaMessage = finalMessages.find(msg =>
                msg.content?.some(part => part.type === 'image_url')
            )

            expect(mediaMessage).toBeDefined()
            expect(mediaMessage?.speaker).toBe('human')
            expect(mediaMessage?.text).toEqual(undefined)
            expect(mediaMessage?.content).toEqual([
                {
                    type: 'image_url',
                    image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAA==' },
                },
            ])

            // Verify that there's an assistant message after the media message
            const assistantIndex =
                finalMessages.findIndex(msg => msg.content?.some(part => part.type === 'image_url')) + 1
            expect(finalMessages[assistantIndex].speaker).toBe('assistant')
            expect(finalMessages[assistantIndex].text).toEqual(ps`Ok.`)
        })

        it('should handle multiple media context items correctly', async () => {
            const builder = await PromptBuilder.create({ input: 100, output: 100 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const imageItem1: ContextItemMedia = {
                type: 'media',
                uri: URI.file('/foo/image1.png'),
                size: 1,
                content: 'image data 1',
                data: 'data:image/png;base64,iVBORw0KGgoAAA==',
                mimeType: 'image/png',
                filename: 'image1.png',
                source: ContextItemSource.User,
            }

            const imageItem2: ContextItemMedia = {
                type: 'media',
                uri: URI.file('/foo/image2.jpg'),
                size: 2,
                content: 'image data 2',
                data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
                mimeType: 'image/jpeg',
                filename: 'image2.jpg',
                source: ContextItemSource.User,
            }

            const { added } = await builder.tryAddContext('user', [imageItem1, imageItem2])

            // Verify both media items were added
            expect(added).toEqual([imageItem1, imageItem2])
            expect(builder.contextItems).toEqual([imageItem1, imageItem2])

            // Build the final messages
            const finalMessages = builder.build()

            // Find the media messages
            const mediaMessages = finalMessages.filter(msg =>
                msg.content?.some(part => part.type === 'image_url')
            )

            // Verify we have both images in separate messages
            expect(mediaMessages.length).toBe(2)

            // First image (item 2 is the first image because we add by reverse order)
            const firstImage = mediaMessages[0].content?.[0]
            expect(firstImage?.type).toBe('image_url')
            if (firstImage?.type === 'image_url') {
                expect(firstImage.image_url.url).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==')
            }

            // Second image
            const secondImage = mediaMessages[1].content?.[0]
            if (secondImage?.type === 'image_url') {
                expect(secondImage.type).toBe('image_url')
                expect(secondImage.image_url?.url).toEqual('data:image/png;base64,iVBORw0KGgoAAA==')
            }

            // Verify assistant messages are inserted correctly between images
            const assistantMessages = finalMessages.filter(
                msg => msg.speaker === 'assistant' && msg.text?.toString() === 'Ok.'
            )
            console.log(finalMessages)
            expect(assistantMessages.length).toBe(2) // One after each context
        })

        it('should skip token counting for media context items', async () => {
            // Create a builder with very limited token budget
            const builder = await PromptBuilder.create({ input: 10, output: 10 })
            builder.tryAddToPrefix(preamble)
            builder.tryAddMessages([...chatTranscript].reverse())

            const imageItem: ContextItem = {
                type: 'media',
                uri: URI.file('/foo/large-image.png'),
                // Large size that would normally exceed token limits
                size: 1000000,
                content: 'very large image data',
                data: 'data:image/png;base64,iVBORw0KGgoAAA==',
                mimeType: 'image/png',
                filename: 'large-image.png',
                source: ContextItemSource.User,
            }

            // A text file that would exceed token limits
            const largeTextFile: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/large-file.txt'),
                size: 1000000,
                content: 'This is a very large text file that should exceed token limits',
                source: ContextItemSource.User,
            }

            // Add both items
            const { added, ignored, limitReached } = await builder.tryAddContext('user', [
                imageItem,
                largeTextFile,
            ])

            // The image should be added regardless of size, but the text file should be ignored
            expect(limitReached).toBe(true)
            expect(ignored).toEqual([largeTextFile])
            expect(added).toEqual([imageItem])
            expect(builder.contextItems).toEqual([imageItem])

            // Build final messages
            const finalMessages = builder.build()

            // Verify the image is in the final messages
            const mediaMessage = finalMessages.find(msg =>
                msg.content?.some(part => part.type === 'image_url')
            )
            expect(mediaMessage).toBeDefined()
        })

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
                source: ContextItemSource.Terminal,
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
                source: ContextItemSource.Search,
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
            mockLocalStorage('inMemory')
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

describe('PromptBuilder', () => {
    beforeEach(() => {
        vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    })
    describe('isCacheEnabled', () => {
        it('handles disabled feature flag correctly', async () => {
            const promptBuilder = await PromptBuilder.create({
                input: 8192,
                output: 4096,
            })

            // First access should trigger enrollment but still return feature flag value
            expect(promptBuilder.isCacheEnabled).toBe(false)

            // Second access should use cached value
            expect(promptBuilder.isCacheEnabled).toBe(false)
        })

        it('respects feature flag value and tracks enrollment', async () => {
            // Mock feature flag provider
            vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(true))
            const promptBuilder = await PromptBuilder.create({
                input: 8192,
                output: 4096,
            })

            // First access should trigger enrollment but still return feature flag value
            expect(promptBuilder.isCacheEnabled).toBe(true)

            // Second access should use cached value
            expect(promptBuilder.isCacheEnabled).toBe(true)
            vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
        })
    })
})
