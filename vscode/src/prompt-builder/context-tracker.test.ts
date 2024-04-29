import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { ContextTracker } from './context-tracker'

describe('ContextTracker', () => {
    describe('add', () => {
        it('should add a new context item to the tracker', () => {
            const tracker = new ContextTracker([])
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }
            const tracked = tracker.add(item)
            expect(tracked).toBe(true)
            expect(tracker.added).toStrictEqual([item])
        })

        it('should track unique context items and differentiate based on source', () => {
            const tracker = new ContextTracker([])
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
            expect(tracker.add(user)).toBeTruthy()
            expect(tracker.add(unified)).toBeTruthy()
            expect(tracker.added).toStrictEqual([user, unified])
        })

        it('should not track the same context item twice', () => {
            const tracker = new ContextTracker([])
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }
            expect(tracker.add(item)).toBeTruthy()
            expect(tracker.add(item)).toBeFalsy()
            expect(tracker.added).toStrictEqual([item])
        })

        it('should track a larger range but not a smaller range contained within it from the same file', () => {
            const tracker = new ContextTracker([])
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

            expect(tracker.add(large)).toBeTruthy()
            expect(tracker.add(small)).toBeFalsy()
            expect(tracker.added).toStrictEqual([large])
        })

        it('should track two non-overlapping ranges from the same filee', () => {
            const tracker = new ContextTracker([])
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

            expect(tracker.add(item1)).toBeTruthy()
            expect(tracker.add(item2)).toBeTruthy()

            expect(tracker.added).toStrictEqual([item1, item2])
        })

        it('should not track selection if item with full range is included', () => {
            const tracker = new ContextTracker([])
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

            expect(tracker.add(selection)).toBeTruthy()
            expect(tracker.add(fullFile)).toBeTruthy()
            expect(tracker.add(selection)).toBeFalsy()

            expect(tracker.added).toStrictEqual([fullFile])
        })

        it('should track items from different sources unless their ranges overlap', () => {
            const tracker = new ContextTracker([])
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
            expect(tracker.add(item1)).toBeTruthy()
            expect(tracker.add(item2)).toBeTruthy()
            expect(tracker.add(overlap)).toBeFalsy()
            expect(tracker.add(item2)).toBeFalsy()

            expect(tracker.added).toStrictEqual([item1, item2])
        })

        it('should track context from file with multiline range but not a single line range that overlaps with it', () => {
            const tracker = new ContextTracker([])
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
            expect(tracker.add(multiLine)).toBeTruthy()
            expect(tracker.add(singleLine)).toBeFalsy()

            expect(tracker.added).toStrictEqual([multiLine])
        })

        it('should track item with multiline range when the single line is within the multiline range', () => {
            const tracker = new ContextTracker([])
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

            expect(tracker.add(singleLine)).toBeTruthy()
            expect(tracker.add(multiLine)).toBeTruthy()

            expect(tracker.added).toStrictEqual([multiLine])
        })

        it('should track items from previous sessions when provided at init', () => {
            const tracker = new ContextTracker([])
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

            expect(tracker.add(singleLine)).toBeTruthy()
            expect(tracker.add(multiLine)).toBeTruthy()

            const used = tracker.added
            expect(used).toStrictEqual([multiLine])

            // Create a new tracker with the used items from the previous tracker
            const tracker2 = new ContextTracker(used)
            expect(tracker2.add(singleLine)).toBeFalsy()
            expect(tracker.added).toStrictEqual(used)
        })
    })

    describe('remove', () => {
        it('should remove untracked item from store', () => {
            const tracker = new ContextTracker([])
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
            }
            // Tracked item is added to the tracking list
            expect(tracker.add(item)).toBeTruthy()
            expect(tracker.added).toStrictEqual([item])
            // Untrack item is removed from the store
            tracker.remove(item)
            expect(tracker.added).toStrictEqual([])
        })

        it('should be able to re-track untracked item', () => {
            const tracker = new ContextTracker([])
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                source: ContextItemSource.User,
            }
            expect(tracker.add(item)).toBeTruthy()
            tracker.remove(item)
            expect(tracker.add(item)).toBeTruthy()
            expect(tracker.added).toStrictEqual([item])
        })
    })
})
