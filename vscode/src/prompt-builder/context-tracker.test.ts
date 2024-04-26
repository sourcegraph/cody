import { type ContextItem, ContextItemSource, displayPath } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { ContextTracker } from './context-tracker'

describe('ContextTracker', () => {
    describe('track', () => {
        it('should add a new context item to the tracker', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }
            const tracked = tracker.track(item)
            expect(tracked).toBe(true)
            expect(tracker.getTrackedContextItems).toStrictEqual([item])
        })

        it('should track unique context items and differentiate based on source', () => {
            const tracker = new ContextTracker()
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
            expect(tracker.track(user)).toBeTruthy()
            expect(tracker.track(unified)).toBeTruthy()
            expect(tracker.getTrackedContextItems).toStrictEqual([user, unified])
        })

        it('should not track the same context item twice', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }
            expect(tracker.track(item)).toBeTruthy()
            expect(tracker.track(item)).toBeFalsy()
            expect(tracker.getTrackedContextItems).toStrictEqual([item])
        })

        it('should track a larger range but not a smaller range contained within it from the same file', () => {
            const tracker = new ContextTracker()
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

            expect(tracker.track(large)).toBeTruthy()
            expect(tracker.track(small)).toBeFalsy()
            expect(tracker.getTrackedContextItems).toStrictEqual([large])
        })

        it('should track two non-overlapping ranges from the same filee', () => {
            const tracker = new ContextTracker()
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

            expect(tracker.track(item1)).toBeTruthy()
            expect(tracker.track(item2)).toBeTruthy()

            expect(tracker.getTrackedContextItems).toStrictEqual([item1, item2])
        })

        it('should track items from different sources unless their ranges overlap', () => {
            const tracker = new ContextTracker()
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
            expect(tracker.track(item1)).toBeTruthy()
            expect(tracker.track(item2)).toBeTruthy()
            expect(tracker.track(overlap)).toBeFalsy()
            expect(tracker.track(item2)).toBeFalsy()

            expect(tracker.getTrackedContextItems).toStrictEqual([item1, item2])
        })

        it('should track context from file with multiline range but not a single line range that overlaps with it', () => {
            const tracker = new ContextTracker()
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
            expect(tracker.track(multiLine)).toBeTruthy()
            expect(tracker.track(singleLine)).toBeFalsy()

            expect(tracker.getTrackedContextItems).toStrictEqual([multiLine])
        })

        it('should track item with multiline range when the single line is within the multiline range', () => {
            const tracker = new ContextTracker()
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

            expect(tracker.track(singleLine)).toBeTruthy()
            expect(tracker.track(multiLine)).toBeTruthy()

            expect(tracker.getTrackedContextItems).toStrictEqual([multiLine])
        })
    })

    describe('untrack', () => {
        it('should remove untracked item from store', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
            }
            // Tracked item is added to the tracking list
            expect(tracker.track(item)).toBeTruthy()
            expect(tracker.getTrackedContextItems).toStrictEqual([item])
            // Untrack item is removed from the store
            tracker.untrack(item)
            expect(tracker.getTrackedContextItems).toStrictEqual([])
        })

        it('should be able to re-track untracked item', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                source: ContextItemSource.User,
            }
            expect(tracker.track(item)).toBeTruthy()
            tracker.untrack(item)
            expect(tracker.track(item)).toBeTruthy()
            expect(tracker.getTrackedContextItems).toStrictEqual([item])
        })
    })

    describe('getContextDisplayID', () => {
        it('should generate correct ID for non-codebase context items', () => {
            const tracker = new ContextTracker()
            const item1: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                source: ContextItemSource.Terminal,
            }
            const item2: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/baz'),
                source: ContextItemSource.Uri,
            }
            expect(tracker.getContextDisplayID(item1)).toBe(
                `${displayPath(item1.uri)}#${SHA256(item1.content ?? '').toString()}`
            )
            expect(tracker.getContextDisplayID(item2)).toBe(
                `${displayPath(item2.uri)}#${SHA256(item2.content ?? '').toString()}`
            )
        })

        it('should generate correct ID for unified context items', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('my/file/path'),
                content: 'foobar',
                source: ContextItemSource.Unified,
                title: 'my/file/path',
            }
            const id = tracker.getContextDisplayID(item)
            expect(id).toBe('my/file/path')
        })

        it('should generate correct ID for editor context items', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                source: ContextItemSource.Editor,
            }
            const id = tracker.getContextDisplayID(item)
            expect(id).toBe(displayPath(item.uri))
        })
    })
})
