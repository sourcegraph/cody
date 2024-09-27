import type { ContextItem } from '@sourcegraph/cody-shared'
import { useMemo } from 'react'
import { useExtensionAPI } from './useExtensionAPI'
import { useObservable } from './useObservable'

/**
 * Get the initial context with which to populate the chat message input field.
 */
export function useInitialContextForChat(): ContextItem[] {
    const initialContext = useExtensionAPI().initialContext
    return useObservable(useMemo(() => initialContext(), [initialContext])).value ?? EMPTY
}

const EMPTY: ContextItem[] = []
