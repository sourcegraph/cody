import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'
import { SHA256 } from 'crypto-js'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { ContextTracker } from './context-tracker'

describe('ContextTracker', () => {
    describe('track', () => {
        it('should track a context item with no range', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
            }
            const tracked = tracker.track(item)
            expect(tracked).toBe(true)
        })

        it('should not track a context item with a range contained within an existing tracked range', () => {
            const tracker = new ContextTracker()
            const item1: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 10 } },
                source: ContextItemSource.User,
            }
            const item2: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
                range: { start: { line: 2, character: 0 }, end: { line: 5, character: 10 } },
                source: ContextItemSource.Embeddings,
            }

            expect(tracker.track(item1)).toBeTruthy()
            expect(tracker.track(item2)).toBeFalsy()
        })

        it('should track a context item with a range not contained within any existing tracked range', () => {
            const tracker = new ContextTracker()
            const item1: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
            }
            const item2: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
                range: { start: { line: 15, character: 0 }, end: { line: 20, character: 0 } },
            }

            expect(tracker.track(item1)).toBeTruthy()
            expect(tracker.track(item2)).toBeTruthy()
        })
    })

    describe('untrack', () => {
        it('should remove a context item with no range', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
                source: ContextItemSource.User,
            }
            expect(tracker.track(item)).toBeTruthy()
            expect(tracker.track(item)).toBeFalsy()
            tracker.untrack(item)
            expect(tracker.track(item)).toBeTruthy()
        })

        it('should remove a range from a context item with multiple ranges', () => {
            const tracker = new ContextTracker()
            const item1: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
                range: { start: { line: 0, character: 0 }, end: { line: 10, character: 0 } },
            }
            const item2: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
                range: {
                    start: { line: 15, character: 0 },
                    end: { line: 20, character: 0 },
                },
            }
            expect(tracker.track(item1)).toBeTruthy()
            expect(tracker.track(item2)).toBeFalsy()
        })

        it('should remove a context item when all its ranges are removed', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 0 },
                },
            }
            tracker.track(item)
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
                size: 100,
                source: ContextItemSource.Terminal,
            }
            const item2: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/baz'),
                content: 'foobaz',
                size: 100,
                source: ContextItemSource.Uri,
            }
            const id1 = tracker.getContextItemId(item1)
            const id2 = tracker.getContextItemId(item2)
            expect(id1).toBe(`${item1.uri.toString()}#${SHA256(item1.content ?? '').toString()}`)
            expect(id2).toBe(`${item2.uri.toString()}#${SHA256(item2.content ?? '').toString()}`)
        })

        it('should generate correct ID for unified context items', () => {
            const tracker = new ContextTracker()
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
                size: 100,
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
                size: 100,
                source: ContextItemSource.Editor,
            }
            const id = tracker.getContextItemId(item)
            expect(id).toBe('/foo/bar')
        })
    })
})
