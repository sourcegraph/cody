import {
    type ContextItem,
    asyncGeneratorFromPromise,
    asyncGeneratorWithValues,
} from '@sourcegraph/cody-shared'
import { renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { URI } from 'vscode-uri'
import { MOCK_API, useExtensionAPI } from '../../useExtensionAPI'
import { useChatContextItems } from './useChatContextItems'

vi.mock('../../useExtensionAPI')

describe('useChatContextItems', () => {
    test('returns filtered providers and items based on query', async () => {
        const CONTEXT_ITEM: ContextItem = { type: 'file', uri: URI.file('foo.go') }

        let resolve: (items: ContextItem[]) => void
        const itemsPromise = new Promise<ContextItem[]>(resolve_ => {
            resolve = resolve_
        })

        vi.mocked(useExtensionAPI).mockReturnValue({
            ...MOCK_API,
            mentionProviders: () => asyncGeneratorWithValues([]),
            contextItems: () => asyncGeneratorFromPromise(itemsPromise),
        })

        const { result } = renderHook(() => useChatContextItems('q', null))

        expect(result.current).toEqual<typeof result.current>({
            done: false,
            error: null,
            value: undefined,
        })

        resolve!([CONTEXT_ITEM])
        await itemsPromise
        await new Promise<void>(resolve => setTimeout(resolve))

        expect(result.current).toEqual<typeof result.current>({
            done: true,
            error: null,
            value: [CONTEXT_ITEM],
        })
    })
})
