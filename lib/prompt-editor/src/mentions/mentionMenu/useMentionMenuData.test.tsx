import {
    type ContextItem,
    ContextItemSource,
    type ContextMentionProviderMetadata,
    asyncGeneratorWithValues,
} from '@sourcegraph/cody-shared'
import { renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { useClientState } from '../../clientState'
import { useChatContextItems } from '../../plugins/atMentions/useChatContextItems'
import { waitForAsyncGeneratorInTest } from '../../useAsyncGenerator'
import { MOCK_API, useExtensionAPI } from '../../useExtensionAPI'
import { useMentionMenuData } from './useMentionMenuData'

vi.mock('../../plugins/atMentions/useChatContextItems')
vi.mock('../../useExtensionAPI')
vi.mock('../../clientState')

describe('useMentionMenuData', () => {
    describe('initial context deduping', () => {
        test('items does not duplicate items from initialContextItems', async () => {
            const file1: ContextItem = {
                uri: URI.parse('file1.ts'),
                type: 'file',
                isTooLarge: undefined,
                source: ContextItemSource.User,
            }
            const mockContextItems: ContextItem[] = [
                file1,
                {
                    uri: URI.parse('file2.ts'),
                    type: 'file',
                    isTooLarge: undefined,
                    source: ContextItemSource.User,
                },
                {
                    uri: URI.parse('file3.ts'),
                    type: 'file',
                    isTooLarge: undefined,
                    source: ContextItemSource.User,
                },
            ]
            const mockProviders: ContextMentionProviderMetadata[] = [
                { title: 'My Provider', id: 'my-provider', queryLabel: '', emptyLabel: '' },
            ]

            vi.mocked(useChatContextItems).mockReturnValue({
                done: false,
                error: null,
                value: [file1, mockContextItems[1], mockContextItems[2]],
            })
            vi.mocked(useExtensionAPI).mockReturnValue({
                ...MOCK_API,
                mentionProviders: () => asyncGeneratorWithValues(mockProviders),
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

            // When there's a query that matches the initial context, it should be included.
            vi.mocked(useChatContextItems).mockReturnValue({
                done: false,
                error: null,
                value: [file1],
            })
            const { result: result2 } = renderHook(() =>
                useMentionMenuData(
                    { query: 'file1', parentItem: null },
                    { remainingTokenBudget: 100, limit: 10 }
                )
            )
            await waitForAsyncGeneratorInTest()
            expect(result2.current).toEqual<typeof result2.current>({
                providers: [],
                items: [file1FromInitialContext],
            })
        })
    })

    test('passes along errors', async () => {
        const mockProviders: ContextMentionProviderMetadata[] = [
            { title: 'My Provider', id: 'my-provider', queryLabel: '', emptyLabel: '' },
        ]

        vi.mocked(useChatContextItems).mockReturnValue({
            done: true,
            error: new Error('my error'),
            value: undefined,
        })
        vi.mocked(useExtensionAPI).mockReturnValue({
            ...MOCK_API,
            mentionProviders: () => asyncGeneratorWithValues(mockProviders),
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
