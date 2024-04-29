import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { ContextSet } from './context-set'

describe('ContextSet', () => {
    describe('add', () => {
        it('should add a new context item to the set', () => {
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }

            const set = new ContextSet([])
            expect(set.add(item)).toBe(true)
            expect(set.values).toStrictEqual([item])
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

            const set = new ContextSet([])
            expect(set.add(user)).toBeTruthy()
            expect(set.add(unified)).toBeTruthy()
            expect(set.values).toStrictEqual([user, unified])
        })

        it('should not add the same context item twice', () => {
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content: 'foobar',
            }

            const set = new ContextSet([])
            expect(set.add(item)).toBeTruthy()
            expect(set.add(item)).toBeFalsy()
            expect(set.values).toStrictEqual([item])
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

            const set = new ContextSet([])
            expect(set.add(large)).toBeTruthy()
            expect(set.add(small)).toBeFalsy()
            expect(set.values).toStrictEqual([large])
        })

        it('should add context to set for two non-overlapping ranges from the same filee', () => {
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

            const set = new ContextSet([])
            expect(set.add(item1)).toBeTruthy()
            expect(set.add(item2)).toBeTruthy()

            expect(set.values).toStrictEqual([item1, item2])
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

            const set = new ContextSet([])
            expect(set.add(selection)).toBeTruthy()
            expect(set.add(fullFile)).toBeTruthy()
            expect(set.add(selection)).toBeFalsy()

            expect(set.values).toStrictEqual([fullFile])
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

            const set = new ContextSet([])
            expect(set.add(item1)).toBeTruthy()
            expect(set.add(item2)).toBeTruthy()
            expect(set.add(overlap)).toBeFalsy()
            expect(set.add(item2)).toBeFalsy()

            expect(set.values).toStrictEqual([item1, item2])
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

            const set = new ContextSet([])
            expect(set.add(multiLine)).toBeTruthy()
            expect(set.add(singleLine)).toBeFalsy()

            expect(set.values).toStrictEqual([multiLine])
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

            const set = new ContextSet([])
            expect(set.add(singleLine)).toBeTruthy()
            expect(set.add(multiLine)).toBeTruthy()

            expect(set.values).toStrictEqual([multiLine])
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

            const set = new ContextSet([])
            expect(set.add(selection)).toBeTruthy()
            expect(set.values).toStrictEqual([selection])
            expect(set.add(fullFile)).toBeTruthy()
            expect(set.values).toStrictEqual([fullFile])
            expect(set.add(selection)).toBeTruthy()
            expect(set.values).toStrictEqual([selection])
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

            const sessionOneSet = new ContextSet([])
            expect(sessionOneSet.add(singleLine)).toBeTruthy()
            expect(sessionOneSet.add(multiLine)).toBeTruthy()

            // Used items from session one
            const usedInSessionOne = sessionOneSet.values
            expect(usedInSessionOne).toStrictEqual([multiLine])

            // Create a new set with the used items from the previous session
            const sessionTwoSet = new ContextSet(usedInSessionOne)
            expect(sessionTwoSet.add(singleLine)).toBeFalsy()
            expect(sessionTwoSet.values).not.toStrictEqual(usedInSessionOne)
            expect(sessionTwoSet.values).toStrictEqual([])
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

            // Context item is added to the set
            const set = new ContextSet([])
            expect(set.add(item)).toBeTruthy()
            expect(set.values).toStrictEqual([item])

            // Remove item from the set
            set.remove(item)
            expect(set.values).toStrictEqual([])
        })

        it('should be able to re-add removed item to added list', () => {
            const item: ContextItem = {
                type: 'file',
                uri: URI.file('/foo/bar'),
                source: ContextItemSource.User,
            }

            const set = new ContextSet([])
            // Confirm that the item is added
            expect(set.add(item)).toBeTruthy()
            // and adding it again should return false
            expect(set.add(item)).toBeFalsy()
            expect(set.values).toStrictEqual([item])

            // Remove the item from the set
            set.remove(item)
            expect(set.values).toStrictEqual([])

            // Confirm that the item can be re-added
            expect(set.add(item)).toBeTruthy()
            expect(set.values).toStrictEqual([item])
        })
    })
})
