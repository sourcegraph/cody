import {
    type ContextItem,
    ContextItemSource,
    type ContextMentionProviderMetadata,
} from '@sourcegraph/cody-shared'
import { renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { useClientState } from '../../clientState'
import {
    useChatContextItems,
    useChatContextMentionProviders,
} from '../../plugins/atMentions/chatContextClient'
import { useMentionMenuData } from './useMentionMenuData'

vi.mock('../../plugins/atMentions/chatContextClient')
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

        vi.mocked(useChatContextItems).mockReturnValue([
            mockContextItems[0],
            mockContextItems[1],
            mockContextItems[2],
        ])
        vi.mocked(useChatContextMentionProviders).mockReturnValue({
            providers: mockProviders,
            reload: () => {},
        })
        vi.mocked(useClientState).mockReturnValue({
            initialContext: [mockContextItems[0]],
        })

        const { result } = renderHook(() =>
            useMentionMenuData({ query: '', parentItem: null }, { remainingTokenBudget: 100, limit: 10 })
        )
        expect(result.current.providers).toEqual(mockProviders)
        expect(result.current.initialContextItems).toEqual([mockContextItems[0]])
        expect(result.current.items).toEqual<ContextItem[]>([mockContextItems[1], mockContextItems[2]])
    })
})
