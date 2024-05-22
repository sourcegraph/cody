import type { ContextItem } from '@sourcegraph/cody-shared'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'
import { type ChatContextClient, WithChatContextClient, useChatContextItems } from './chatContextClient'

describe('useChatContextItems', () => {
    test('returns filtered providers and items based on query', async () => {
        const CONTEXT_ITEM: ContextItem = { type: 'file', uri: URI.file('foo.go') }

        let resolve: (items: ContextItem[]) => void
        const itemsPromise = new Promise<ContextItem[]>(resolve_ => {
            resolve = resolve_
        })
        const client: ChatContextClient = {
            getChatContextItems: () => itemsPromise,
        }

        const { result } = renderHook(() => useChatContextItems('q', null), {
            wrapper: ({ children }) =>
                React.createElement(WithChatContextClient, { value: client }, children),
        })

        expect(result.current).toBe(undefined)

        resolve!([CONTEXT_ITEM])
        await itemsPromise
        await new Promise<void>(resolve => setTimeout(resolve))

        expect(result.current).toEqual([CONTEXT_ITEM])
    })
})
