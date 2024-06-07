import { type ContextItem, ContextItemSource, type RangeData } from '@sourcegraph/cody-shared'
import { describe, expect, it } from 'vitest'
import { URI } from 'vscode-uri'
import { getUniqueContextItems, isUniqueContextItem } from './unique-context'

describe('Unique Context Items', () => {
    const baseFile: ContextItem = {
        type: 'file',
        uri: URI.file('/foo/bar.js'),
        content: 'foobar',
    }

    describe('getUniqueContextItems', () => {
        it('should return context item when there are no existing items', () => {
            expect(getUniqueContextItems([baseFile])).toStrictEqual([baseFile])
        })

        it('should return empty array when no item is provided', () => {
            expect(getUniqueContextItems([])).toStrictEqual([])
        })

        it('should add unique context items from different sources', () => {
            const user: ContextItem = {
                ...baseFile,
                source: ContextItemSource.User,
            }
            const unified: ContextItem = {
                ...baseFile,
                source: ContextItemSource.Unified,
                title: '/foo/bar',
            }

            expect(getUniqueContextItems([user, unified])).toStrictEqual([user, unified])
        })

        it('should not add duplicate context items', () => {
            expect(getUniqueContextItems([baseFile, baseFile])).toStrictEqual([baseFile])
        })

        it('should add a context item with a larger range but not a smaller range contained within it from the same file', () => {
            const large: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 10 },
                },
                source: ContextItemSource.Embeddings,
            }
            const small: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 2, character: 0 },
                    end: { line: 5, character: 10 },
                },
                source: ContextItemSource.Embeddings,
            }

            expect(getUniqueContextItems([large, small])).toStrictEqual([large])
        })

        it('should add context items with non-overlapping ranges from the same file', () => {
            const item1: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 0 },
                },
            }
            const item2: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 15, character: 0 },
                    end: { line: 20, character: 0 },
                },
            }

            expect(getUniqueContextItems([item1, item2])).toStrictEqual([item1, item2])
        })

        it('should not remove selection context item with inner range when adding a full range item', () => {
            const editor: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 0 },
                },
                source: ContextItemSource.Editor,
            }
            const selection: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 2, character: 0 },
                    end: { line: 5, character: 0 },
                },
                source: ContextItemSource.Selection,
            }

            expect(getUniqueContextItems([selection, editor, editor])).toStrictEqual([selection, editor])
        })

        it('should add items from different sources unless their ranges overlap', () => {
            const user: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 0 },
                },
                source: ContextItemSource.User,
            }
            const search: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 15, character: 0 },
                    end: { line: 20, character: 0 },
                },
                source: ContextItemSource.Search,
            }
            const overlap: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 1, character: 0 },
                    end: { line: 10, character: 0 },
                },
                source: ContextItemSource.Embeddings,
            }

            expect(getUniqueContextItems([user, search, overlap, search])).toStrictEqual([user, search])
        })

        it('should add context from a file with a multiline range but not with a single line range that overlaps with it', () => {
            const singleLine: ContextItem = {
                type: 'file',
                uri: URI.file('/src/squirrel.ts'),
                content: 'export interface Squirrel {}',
                size: 10,
                range: {
                    start: { line: 5, character: 0 },
                    end: { line: 5, character: 0 },
                },
            }
            const multiLine: ContextItem = {
                type: 'file',
                uri: URI.file('/src/squirrel.ts'),
                content: `/**
                * Squirrel is an interface that mocks something completely unrelated to squirrels.
                * It is related to the implementation of precise code navigation in Sourcegraph.
                */
               export interface Squirrel {}`,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 5, character: 0 },
                },
            }

            expect(getUniqueContextItems([multiLine, singleLine])).toStrictEqual([multiLine])
            // should add item with multiline range when the single line is within the multiline range
            expect(getUniqueContextItems([singleLine, multiLine])).toStrictEqual([multiLine])
        })

        it('should keep all user/selection context items unless they are duplicates or have the same range', () => {
            const user: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 0 },
                },
                source: ContextItemSource.User,
            }
            const userWithDiffRange: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 11, character: 11 },
                    end: { line: 20, character: 0 },
                },
                source: ContextItemSource.Selection,
            }
            const selection: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 0 },
                },
                source: ContextItemSource.Selection,
            }
            expect(getUniqueContextItems([selection])).toStrictEqual([selection])
            expect(getUniqueContextItems([selection, user])).toStrictEqual([selection])
            expect(getUniqueContextItems([user, selection, userWithDiffRange])).toStrictEqual([
                user,
                userWithDiffRange,
            ])
        })

        it('should return the first item when duplicated items are added after except user-added items', () => {
            const user: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 0 },
                },
                source: ContextItemSource.User,
            }
            const embeddings: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 10, character: 0 },
                },
                source: ContextItemSource.Embeddings,
            }

            expect(getUniqueContextItems([user])).toStrictEqual([user])
            expect(getUniqueContextItems([user, embeddings, embeddings])).toStrictEqual([user])
            // User-added items should always have the highest priority.
            expect(getUniqueContextItems([embeddings, user])).toStrictEqual([user])
        })

        it('should return the item with the largest outer range', () => {
            const singleLine: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 5, character: 0 },
                    end: { line: 5, character: 0 },
                },
            }
            const multiLine: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 5, character: 0 },
                },
            }

            expect(getUniqueContextItems([singleLine, multiLine, singleLine])).toStrictEqual([multiLine])
        })

        it('should return items with the largest outer range from different files', () => {
            const singleLineFile1: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 5, character: 0 },
                    end: { line: 5, character: 0 },
                },
            }
            const multiLineFile1: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 5, character: 0 },
                },
            }
            const singleLineFile2: ContextItem = {
                type: 'file',
                uri: URI.file('/src/different.ts'),
                content: 'different file',
                size: 10,
                range: {
                    start: { line: 5, character: 0 },
                    end: { line: 5, character: 0 },
                },
            }

            expect(
                getUniqueContextItems([singleLineFile1, multiLineFile1, singleLineFile2])
            ).toStrictEqual([multiLineFile1, singleLineFile2])
        })

        it('should return the outermost item of user items', () => {
            const inner: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 3, character: 0 },
                    end: { line: 10, character: 0 },
                },
                source: ContextItemSource.User,
            }
            const outter: ContextItem = {
                ...baseFile,
                source: ContextItemSource.User,
                range: {
                    start: { line: 1, character: 0 },
                    end: { line: 12, character: 0 },
                },
            }

            expect(getUniqueContextItems([inner, outter])).toStrictEqual([outter])
            expect(getUniqueContextItems([outter, inner])).toStrictEqual([outter])
        })

        it('should return the item with no range as it represents the full content of the file', () => {
            const noRange: ContextItem = {
                ...baseFile,
                source: ContextItemSource.User,
            }
            const inner: ContextItem = {
                ...baseFile,
                range: {
                    start: { line: 188, character: 0 },
                    end: { line: 194, character: 0 },
                },
                source: ContextItemSource.Search,
            }

            expect(getUniqueContextItems([noRange, inner])).toStrictEqual([noRange])
            expect(getUniqueContextItems([noRange, inner, noRange])).toStrictEqual([noRange])
            expect(getUniqueContextItems([inner, noRange])).toStrictEqual([noRange])
            expect(getUniqueContextItems([inner, noRange, inner, inner])).toStrictEqual([noRange])
        })
    })

    describe('isUniqueContextItem', () => {
        const contentLines = [...Array(20).keys()].map(i => `line ${i + 1}`)

        /** returns the file with content respecting range */
        const baseFile = (range?: RangeData): ContextItem => {
            let content = contentLines.join('\n')
            if (range) {
                // sliceing below depends on character being 0
                expect(range.start.character).toEqual(0)
                expect(range.end.character).toEqual(0)
                expect(range.end.line).toBeLessThanOrEqual(contentLines.length)
                content = contentLines.slice(range.start.line, range.end.line).join('\n')
            }
            return {
                type: 'file',
                uri: URI.file('/foo/bar'),
                content,
                range,
            }
        }

        it('returns false when the new item is a duplicate with the same display path and range', () => {
            const item = baseFile({
                start: { line: 0, character: 0 },
                end: { line: 5, character: 0 },
            })

            expect(isUniqueContextItem(item, [item])).toBeFalsy()
        })

        it('returns true when the new item has a different range (unique)', () => {
            const item1: ContextItem = baseFile({
                start: { line: 0, character: 0 },
                end: { line: 10, character: 0 },
            })
            const item2: ContextItem = baseFile({
                start: { line: 11, character: 0 },
                end: { line: 20, character: 0 },
            })

            expect(isUniqueContextItem(item2, [item1])).toBeTruthy()
        })

        it('returns true when the new item has no range and not duplicate', () => {
            const item1: ContextItem = baseFile({
                start: { line: 0, character: 0 },
                end: { line: 10, character: 0 },
            })
            const item2: ContextItem = baseFile(undefined)

            expect(isUniqueContextItem(item2, [item1])).toBeTruthy()

            // Returns false when it's a duplicate
            expect(isUniqueContextItem(item1, [item1, item1, item1])).toBeFalsy()
            expect(isUniqueContextItem(item2, [item2, item1])).toBeFalsy()
            expect(isUniqueContextItem(item2, [item1, item2])).toBeFalsy()
        })

        it('returns false when the new item has no range and an earlier item has whole file range', () => {
            const item1: ContextItem = baseFile({
                start: { line: 0, character: 0 },
                end: { line: contentLines.length, character: 0 },
            })
            const item2: ContextItem = baseFile(undefined)

            expect(isUniqueContextItem(item2, [item1])).toBeFalsy()
        })

        it('returns false when the new item is a duplicate with a larger range', () => {
            const inner: ContextItem = baseFile({
                start: { line: 0, character: 0 },
                end: { line: 5, character: 0 },
            })
            const outter: ContextItem = baseFile({
                start: { line: 0, character: 0 },
                end: { line: 10, character: 0 },
            })

            expect(isUniqueContextItem(inner, [outter])).toBeFalsy()
        })

        it('returns false when the new item is a duplicate with a smaller range', () => {
            const outter: ContextItem = baseFile({
                start: { line: 0, character: 0 },
                end: { line: 10, character: 0 },
            })
            const inner: ContextItem = baseFile({
                start: { line: 2, character: 0 },
                end: { line: 5, character: 0 },
            })

            expect(isUniqueContextItem(inner, [outter])).toBeFalsy()
        })

        it('returns false when the new item is a duplicate with a 2nd smaller range', () => {
            const noOverlapFirst: ContextItem = baseFile({
                start: { line: 11, character: 0 },
                end: { line: 15, character: 0 },
            })
            const outer: ContextItem = baseFile({
                start: { line: 0, character: 0 },
                end: { line: 10, character: 0 },
            })
            const inner: ContextItem = baseFile({
                start: { line: 2, character: 0 },
                end: { line: 5, character: 0 },
            })

            expect(isUniqueContextItem(inner, [noOverlapFirst, outer])).toBeFalsy()
        })
    })
})
