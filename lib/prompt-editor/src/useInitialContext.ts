import type { DefaultContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { createContext, useContext, useMemo } from 'react'
import { useExtensionAPI } from './useExtensionAPI'
import { useObservable } from './useObservable'

export const MockDefaultContext = createContext<DefaultContext | null>(null)

/**
 * Get the initial context with which to populate the chat message input field.
 */
export function useDefaultContextForChat(): DefaultContext {
    const c = useContext(MockDefaultContext)
    if (c) {
        return c
    }

    const defaultContext = useExtensionAPI().defaultContext
    return useObservable(useMemo(() => defaultContext(), [defaultContext])).value ?? EMPTY
}

const EMPTY: DefaultContext = {
    initialContext: [],
    corpusContext: [],
}
