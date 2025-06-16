import {
    type ContextItem,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionMenuData,
    promiseToObservable,
} from '@sourcegraph/cody-shared'
import { renderHook } from '@testing-library/react'
import { Observable } from 'observable-fns'
import { describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { MOCK_API, useExtensionAPI } from '../../useExtensionAPI'
import { useDefaultContextForChat } from '../../useInitialContext'
import { waitForObservableInTest } from '../../useObservable'
import { useCallMentionMenuData, useMentionMenuData } from './useMentionMenuData'

vi.mock('../../useExtensionAPI')
vi.mock('../../useInitialContext')
vi.mock('../../useCorpusContextForChat')

describe('useMentionMenuData', () => {
    describe('initial context deduping', () => {
        test('items does not duplicate items from initialContextItems', async () => {
            const file1: ContextItem = {
                uri: URI.file('file1.ts'),
                type: 'file',
                isTooLarge: undefined,
                source: ContextItemSource.User,
            }
            const mockContextItems: ContextItem[] = [
                file1,
                {
                    uri: URI.file('file2.ts'),
                    type: 'file',
                    isTooLarge: undefined,
                    source: ContextItemSource.User,
                },
                {
                    uri: URI.file('file3.ts'),
                    type: 'file',
                    isTooLarge: undefined,
                    source: ContextItemSource.User,
                },
            ]
            const mockProviders: ContextMentionProviderMetadata[] = [
                { title: 'My Provider', id: 'my-provider', queryLabel: '', emptyLabel: '' },
            ]

            vi.mocked(useExtensionAPI).mockReturnValue({
                ...MOCK_API,
                mentionMenuData: () =>
                    Observable.of({
                        providers: mockProviders,
                        items: [file1, mockContextItems[1], mockContextItems[2]],
                    }),
            })
            const file1FromInitialContext: ContextItem = {
                ...mockContextItems[0],
                source: ContextItemSource.Initial,
            }
            vi.mocked(useDefaultContextForChat).mockReturnValue({
                initialContext: [file1FromInitialContext],
                corpusContext: [],
            })

            const { result } = renderHook(() =>
                useMentionMenuData(
                    { query: '', parentItem: null },
                    { remainingTokenBudget: 100, limit: 10 }
                )
            )
            await waitForObservableInTest()
            await waitForObservableInTest()
            expect(result.current).toEqual<typeof result.current>({
                providers: mockProviders,
                items: [file1FromInitialContext, mockContextItems[1], mockContextItems[2]],
            })

            // When there's a query that matches the initial context, the file should still be
            // found.
            vi.mocked(useExtensionAPI).mockReturnValue({
                ...MOCK_API,
                mentionMenuData: () =>
                    Observable.of({
                        providers: [],
                        items: [file1],
                    }),
            })
            const { result: result2 } = renderHook(() =>
                useMentionMenuData(
                    { query: 'file1', parentItem: FILE_CONTEXT_MENTION_PROVIDER },
                    { remainingTokenBudget: 100, limit: 10 }
                )
            )
            await waitForObservableInTest()
            await waitForObservableInTest() // HACK(sqs): less flaky on node@18
            expect(result2.current).toEqual<typeof result2.current>({
                providers: [],
                items: [file1],
            })
        })

        test('shows both file with range and file without range for the same URI', async () => {
            // Create two file items with the same URI - one with range, one without
            const fileWithoutRange: ContextItem = {
                uri: URI.file('example.ts'),
                type: 'file',
                title: 'Current File',
                isTooLarge: undefined,
                source: ContextItemSource.Initial,
            }

            const fileWithRange: ContextItem = {
                uri: URI.file('example.ts'),
                type: 'file',
                title: 'Current Selection',
                range: {
                    start: { line: 10, character: 0 },
                    end: { line: 20, character: 0 },
                },
                isTooLarge: undefined,
                source: ContextItemSource.Initial,
            }

            // Mock API to return file with range from items
            const mockProviders: ContextMentionProviderMetadata[] = [
                { title: 'My Provider', id: 'my-provider', queryLabel: '', emptyLabel: '' },
            ]

            vi.mocked(useExtensionAPI).mockReturnValue({
                ...MOCK_API,
                mentionMenuData: () =>
                    Observable.of({
                        providers: mockProviders,
                        items: [
                            {
                                ...fileWithRange,
                                // Create a new object to ensure we're not just seeing the same object twice
                                source: ContextItemSource.User,
                            },
                            {
                                ...fileWithoutRange,
                                // We also return the file without range to verify that deduplication works
                                // This would normally be filtered out with the old logic since it has same URI and type
                                source: ContextItemSource.User,
                            },
                        ],
                    }),
            })

            // Set up initial context with file without range
            // This test simulates having a file in the initial context (without range)
            // and then getting items from the API that include both the file with and without range
            vi.mocked(useDefaultContextForChat).mockReturnValue({
                initialContext: [fileWithoutRange],
                corpusContext: [],
            })

            const { result } = renderHook(() =>
                useMentionMenuData(
                    { query: '', parentItem: null },
                    { remainingTokenBudget: 100, limit: 10 }
                )
            )

            await waitForObservableInTest()

            // Both files should appear in the menu items
            const items = result.current.items || []
            expect(items).toHaveLength(2)

            // Check if we have an item with Current File title and no range
            const hasFileWithoutRange = items.some(
                item =>
                    item.title === 'Current File' &&
                    item.type === 'file' &&
                    !item.range &&
                    item.uri.path === '/example.ts'
            )
            expect(hasFileWithoutRange).toBe(true)

            // Check if we have an item with Current Selection title and with range
            const hasFileWithRange = items.some(
                item =>
                    item.title === 'Current Selection' &&
                    item.type === 'file' &&
                    item.range &&
                    item.range.start.line === 10 &&
                    item.range.end.line === 20 &&
                    item.uri.path === '/example.ts'
            )
            expect(hasFileWithRange).toBe(true)
        })
    })

    test('passes along errors', async () => {
        const mockProviders: ContextMentionProviderMetadata[] = [
            { title: 'My Provider', id: 'my-provider', queryLabel: '', emptyLabel: '' },
        ]

        vi.mocked(useExtensionAPI).mockReturnValue({
            ...MOCK_API,
            mentionMenuData: () =>
                Observable.of({
                    providers: mockProviders,
                    items: [],
                    error: 'my error',
                }),
        })
        vi.mocked(useDefaultContextForChat).mockReturnValue({
            initialContext: [],
            corpusContext: [],
        })

        const { result } = renderHook(() =>
            useMentionMenuData({ query: '', parentItem: null }, { remainingTokenBudget: 100, limit: 10 })
        )
        await waitForObservableInTest()
        await waitForObservableInTest() // reduce flakiness
        expect(result.current).toEqual<typeof result.current>({
            items: [],
            providers: mockProviders,
            error: 'my error',
        })
    })
})

describe('useCallMentionMenuData', () => {
    test('returns filtered providers and items based on query', async () => {
        const CONTEXT_ITEM: ContextItem = { type: 'file', uri: URI.file('foo.go') }

        let resolve: (items: MentionMenuData) => void
        const dataPromise = new Promise<MentionMenuData>(resolve_ => {
            resolve = resolve_
        })

        vi.mocked(useExtensionAPI).mockReturnValue({
            ...MOCK_API,
            mentionMenuData: () => promiseToObservable(dataPromise),
        })

        const { result } = renderHook(() =>
            useCallMentionMenuData({ query: 'q', parentItem: null, interactionID: null })
        )

        expect(result.current).toEqual<typeof result.current>({
            done: false,
            error: null,
            value: undefined,
        })

        resolve!({ providers: [], items: [CONTEXT_ITEM] })
        await dataPromise
        await new Promise<void>(resolve => setTimeout(resolve))

        expect(result.current).toEqual<typeof result.current>({
            done: true,
            error: null,
            value: { providers: [], items: [CONTEXT_ITEM] },
        })
    })
})
