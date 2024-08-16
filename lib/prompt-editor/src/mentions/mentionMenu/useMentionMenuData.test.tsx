import {
    type ContextItem,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    type MentionMenuData,
    asyncGeneratorFromPromise,
    asyncGeneratorWithValues,
} from '@sourcegraph/cody-shared'
import { renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { useClientState } from '../../clientState'
import { waitForAsyncGeneratorInTest } from '../../useAsyncGenerator'
import { MOCK_API, useExtensionAPI } from '../../useExtensionAPI'
import { useCallMentionMenuData, useMentionMenuData } from './useMentionMenuData'

vi.mock('../../useExtensionAPI')
vi.mock('../../clientState')

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
                    asyncGeneratorWithValues({
                        providers: mockProviders,
                        items: [file1, mockContextItems[1], mockContextItems[2]],
                    }),
            })
            const file1FromInitialContext: ContextItem = {
                ...mockContextItems[0],
                source: ContextItemSource.Initial,
            }
            vi.mocked(useClientState).mockReturnValue({
                initialContext: [file1FromInitialContext],
            })

            const { result } = renderHook(() =>
                useMentionMenuData(
                    { query: '', parentItem: null },
                    { remainingTokenBudget: 100, limit: 10 }
                )
            )
            await waitForAsyncGeneratorInTest()
            expect(result.current).toEqual<typeof result.current>({
                providers: mockProviders,
                items: [file1FromInitialContext, mockContextItems[1], mockContextItems[2]],
            })

            // When there's a query that matches the initial context, the file should still be
            // found.
            vi.mocked(useExtensionAPI).mockReturnValue({
                ...MOCK_API,
                mentionMenuData: () =>
                    asyncGeneratorWithValues({
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
            await waitForAsyncGeneratorInTest()
            expect(result2.current).toEqual<typeof result2.current>({
                providers: [],
                items: [file1],
            })
        })
    })

    test('passes along errors', async () => {
        const mockProviders: ContextMentionProviderMetadata[] = [
            { title: 'My Provider', id: 'my-provider', queryLabel: '', emptyLabel: '' },
        ]

        vi.mocked(useExtensionAPI).mockReturnValue({
            ...MOCK_API,
            mentionMenuData: () =>
                asyncGeneratorWithValues({
                    providers: mockProviders,
                    items: [],
                    error: 'my error',
                }),
        })
        vi.mocked(useClientState).mockReturnValue({
            initialContext: [],
        })

        const { result } = renderHook(() =>
            useMentionMenuData({ query: '', parentItem: null }, { remainingTokenBudget: 100, limit: 10 })
        )
        await waitForAsyncGeneratorInTest()
        await waitForAsyncGeneratorInTest() // reduce flakiness
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
            mentionMenuData: () => asyncGeneratorFromPromise(dataPromise),
        })

        const { result } = renderHook(() => useCallMentionMenuData({ query: 'q', parentItem: null }))

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
