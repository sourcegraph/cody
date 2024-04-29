import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { ContextTracker } from './context-tracker'

describe('ContextTracker', () => {
    describe('add', () => {
        it('should add a new context item to the tracker', () => {
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(item)).toBe(true)
            expect(tracker.added).toStrictEqual([item])
        })

        it('should add an unique context items and differentiate based on source', () => {
            const user: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                source: ContextItemSource.User,
            }
            const unified: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                source: ContextItemSource.Unified,
                title: 'my/file/path',
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(user)).toBeTruthy()
            expect(tracker.add(unified)).toBeTruthy()
            expect(tracker.added).toStrictEqual([user, unified])
        })

        it('should not add the same context item twice', () => {
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(item)).toBeTruthy()
            expect(tracker.add(item)).toBeFalsy()
            expect(tracker.added).toStrictEqual([item])
        })

        it('should add a larger range but not a smaller range contained within it from the same file', () => {
            const large: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 10 } },
                source: ContextItemSource.Embeddings,
            }
            const small: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                range: { start: { line: 2, character: 0 }, end: { line: 5, character: 10 } },
                source: ContextItemSource.Embeddings,
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(large)).toBeTruthy()
            expect(tracker.add(small)).toBeFalsy()
            expect(tracker.added).toStrictEqual([large])
        })

        it('should add context to tracker for two non-overlapping ranges from the same filee', () => {
            const item1: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
            }
            const item2: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 15, character: 0 }, end: { line: 20, character: 0 } },
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(item1)).toBeTruthy()
            expect(tracker.add(item2)).toBeTruthy()

            expect(tracker.added).toStrictEqual([item1, item2])
        })

        it('should not add selection if item with full range is included', () => {
            const fullFile: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
                source: ContextItemSource.Editor,
            }
            const selection: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 2, character: 0 }, end: { line: 5, character: 0 } },
                source: ContextItemSource.Selection,
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(selection)).toBeTruthy()
            expect(tracker.add(fullFile)).toBeTruthy()
            expect(tracker.add(selection)).toBeFalsy()

            expect(tracker.added).toStrictEqual([fullFile])
        })

        it('should add items from different sources unless their ranges overlap', () => {
            const item1: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
                source: ContextItemSource.User,
            }
            const item2: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 15, character: 0 }, end: { line: 20, character: 0 } },
                source: ContextItemSource.Search,
            }
            const overlap: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 1, character: 0 }, end: { line: 10, character: 0 } },
                source: ContextItemSource.Embeddings,
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(item1)).toBeTruthy()
            expect(tracker.add(item2)).toBeTruthy()
            expect(tracker.add(overlap)).toBeFalsy()
            expect(tracker.add(item2)).toBeFalsy()

            expect(tracker.added).toStrictEqual([item1, item2])
        })

        it('should add context from file with multiline range but not a single line range that overlaps with it', () => {
            const singleLine: ContextItem = {
                type: 'file',
                uri: URI.file('/src/squirrel.ts'),
                content: 'export interface Squirrel {}',
                size: 10,
                range: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } },
            }
            const multiLine: ContextItem = {
                type: 'file',
                uri: URI.file('/src/squirrel.ts'),
                content: `/**
                * Squirrel is an interface that mocks something completely unrelated to squirrels.
                * It is related to the implementation of precise code navigation in Sourcegraph.
                */
               export interface Squirrel {}`,
                range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(multiLine)).toBeTruthy()
            expect(tracker.add(singleLine)).toBeFalsy()

            expect(tracker.added).toStrictEqual([multiLine])
        })

        it('should add item with multiline range when the single line is within the multiline range', () => {
            const singleLine: ContextItem = {
                type: 'file',
                uri: URI.file('/src/squirrel.ts'),
                content: 'export interface Squirrel {}',
                size: 10,
                range: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } },
            }
            const multiLine: ContextItem = {
                type: 'file',
                uri: URI.file('/src/squirrel.ts'),
                content: `/**
                * Squirrel is an interface that mocks something completely unrelated to squirrels.
                * It is related to the implementation of precise code navigation in Sourcegraph.
                */
               export interface Squirrel {}`,
                range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(singleLine)).toBeTruthy()
            expect(tracker.add(multiLine)).toBeTruthy()

            expect(tracker.added).toStrictEqual([multiLine])
        })

        it('should replace exisiting of context with the same range', () => {
            const fullFile: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
                source: ContextItemSource.Editor,
            }
            const selection: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
                source: ContextItemSource.Selection,
            }

            const tracker = new ContextTracker([])
            expect(tracker.add(selection)).toBeTruthy()
            expect(tracker.added).toStrictEqual([selection])
            expect(tracker.add(fullFile)).toBeTruthy()
            expect(tracker.added).toStrictEqual([fullFile])
            expect(tracker.add(selection)).toBeTruthy()
            expect(tracker.added).toStrictEqual([selection])
        })

        it('should track items from previous sessions when provided at init', () => {
            const singleLine: ContextItem = {
                type: 'file',
                uri: URI.file('/src/squirrel.ts'),
                content: 'export interface Squirrel {}',
                size: 10,
                range: { start: { line: 5, character: 0 }, end: { line: 5, character: 0 } },
            }
            const multiLine: ContextItem = {
                type: 'file',
                uri: URI.file('/src/squirrel.ts'),
                content: `/**
                * Squirrel is an interface that mocks something completely unrelated to squirrels.
                * It is related to the implementation of precise code navigation in Sourcegraph.
                */
               export interface Squirrel {}`,
                range: { start: { line: 0, character: 0 }, end: { line: 5, character: 0 } },
            }

            const sessionOneTracker = new ContextTracker([])
            expect(sessionOneTracker.add(singleLine)).toBeTruthy()
            expect(sessionOneTracker.add(multiLine)).toBeTruthy()

            // Used items from session one
            const usedInSessionOne = sessionOneTracker.added
            expect(usedInSessionOne).toStrictEqual([multiLine])

            // Create a new tracker with the used items from the previous session
            const sessionTwoTracker = new ContextTracker(usedInSessionOne)
            expect(sessionTwoTracker.add(singleLine)).toBeFalsy()
            expect(sessionTwoTracker.added).not.toStrictEqual(usedInSessionOne)
            expect(sessionTwoTracker.added).toStrictEqual([])
        })
    })

    describe('remove', () => {
        it('should remove item from added', () => {
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
            }

            // Context item is added to the tracking list
            const tracker = new ContextTracker([])
            expect(tracker.add(item)).toBeTruthy()
            expect(tracker.added).toStrictEqual([item])

            // Remove item from the tracking list
            tracker.remove(item)
            expect(tracker.added).toStrictEqual([])
        })

        it('should be able to re-add removed item to added list', () => {
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                source: ContextItemSource.User,
            }

            const tracker = new ContextTracker([])
            // Confirm that the item is added to the tracking list
            expect(tracker.add(item)).toBeTruthy()
            // and adding it again should return false
            expect(tracker.add(item)).toBeFalsy()
            expect(tracker.added).toStrictEqual([item])

            // Remove the item from the tracking list
            tracker.remove(item)
            expect(tracker.added).toStrictEqual([])

            // Confirm that the item can be re-added to the tracking list
            expect(tracker.add(item)).toBeTruthy()
            expect(tracker.added).toStrictEqual([item])
        })
    })
})
