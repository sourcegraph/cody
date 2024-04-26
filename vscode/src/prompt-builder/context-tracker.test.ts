import { type ContextItem, ContextItemSource, displayPath } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { ContextTracker } from './context-tracker'

describe('ContextTracker', () => {
    describe('track', () => {
        it('should track a context item', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }
            const tracked = tracker.track(item)
            expect(tracked).toBe(true)
            expect(tracker.usedContextItems).toStrictEqual({ used: [item], duplicate: [] })
        })

        it('should track different context items', () => {
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
            expect(tracker.usedContextItems).toStrictEqual({ used: [user, unified], duplicate: [] })
        })

        it('should not track duplicated context item', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }
            expect(tracker.track(item)).toBeTruthy()
            expect(tracker.track(item)).toBeFalsy()
            expect(tracker.usedContextItems).toStrictEqual({ used: [item], duplicate: [item] })
        })

        it('should not track a context item with a range contained within an existing tracked range from the same file ', () => {
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
            expect(tracker.usedContextItems).toStrictEqual({ used: [large], duplicate: [small] })
        })

        it('should track a context item with a range not contained within any existing tracked range', () => {
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

            expect(tracker.usedContextItems).toStrictEqual({ used: [item1, item2], duplicate: [] })
        })

        it('should not track the same context item with overlapping ranges from different sources', () => {
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

            expect(tracker.usedContextItems).toStrictEqual({
                used: [item1, item2],
                duplicate: [overlap, item2],
            })
        })

        it('should not track a context item with single line that also overlapping with exisiting ranges', () => {
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

            expect(tracker.usedContextItems).toStrictEqual({
                used: [multiLine],
                duplicate: [singleLine],
            })
        })

        it('should track context item that contains an exisiting context item with single line range within its range', () => {
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

            expect(tracker.usedContextItems).toStrictEqual({
                used: [multiLine],
                duplicate: [singleLine],
            })
        })
    })

    describe('untrack', () => {
        it('should not track context item  for  ', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                source: ContextItemSource.User,
            }
            expect(tracker.track(item)).toBeTruthy()
            expect(tracker.track(item)).toBeFalsy()
            tracker.untrack(item)
            expect(tracker.track(item)).toBeTruthy()
        })

        it('should remove a context item when untrack ', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
            }
            expect(tracker.track(item)).toBeTruthy()
            expect(tracker.track(item)).toBeFalsy()
            tracker.untrack(item)
            expect(tracker.track(item)).toBeTruthy()
        })
    })

    describe('getContextItemId', () => {
        it('should generate correct ID for non-codebase context items', () => {
            const tracker = new ContextTracker()
            const item1: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                source: ContextItemSource.Terminal,
            }
            const item2: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/baz'),
                content: 'foobaz',
                source: ContextItemSource.Uri,
            }
            expect(tracker.getContextItemId(item1)).toBe(
                `${displayPath(item1.uri)}#${SHA256(item1.content ?? '').toString()}`
            )
            expect(tracker.getContextItemId(item2)).toBe(
                `${displayPath(item2.uri)}#${SHA256(item2.content ?? '').toString()}`
            )
        })

        it('should generate correct ID for unified context items', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                source: ContextItemSource.Unified,
                title: 'my/file/path',
            }
            const id = tracker.getContextItemId(item)
            expect(id).toBe('my/file/path')
        })

        it('should generate correct ID for editor context items', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                source: ContextItemSource.Editor,
            }
            const id = tracker.getContextItemId(item)
            expect(id).toBe(displayPath(item.uri))
        })
    })
})
