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
    test('items do not include values from initialContextItems', async () => {
        const mockContextItems: ContextItem[] = [
            {
                uri: URI.parse('file1.ts'),
                type: 'file',
                isTooLarge: undefined,
                source: ContextItemSource.User,
            },
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
            value: [mockContextItems[0], mockContextItems[1], mockContextItems[2]],
        })
        vi.mocked(useExtensionAPI).mockReturnValue({
            ...MOCK_API,
            mentionProviders: () => asyncGeneratorWithValues(mockProviders),
        })
        vi.mocked(useClientState).mockReturnValue({
            initialContext: [mockContextItems[0]],
        })

        const { result } = renderHook(() =>
            useMentionMenuData({ query: '', parentItem: null }, { remainingTokenBudget: 100, limit: 10 })
        )
        await waitForAsyncGeneratorInTest()
        expect(result.current).toEqual<typeof result.current>({
            providers: mockProviders,
            initialContextItems: [mockContextItems[0]],
            items: [mockContextItems[1], mockContextItems[2]],
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
        expect(result.current).toEqual<typeof result.current>({
            items: undefined,
            providers: mockProviders,
            initialContextItems: [],
            error: 'my error',
        })
    })
})
