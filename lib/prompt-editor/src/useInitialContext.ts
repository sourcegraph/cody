import type { DefaultContext } from '@sourcegraph/cody-shared/src/codebase-context/messages'
import { useMemo } from 'react'
import { useExtensionAPI } from './useExtensionAPI'
import { useObservable } from './useObservable'

/**
 * Get the initial context with which to populate the chat message input field.
 */
export function useDefaultContextForChat(): DefaultContext {
    const defaultContext = useExtensionAPI().defaultContext
    return useObservable(useMemo(() => defaultContext(), [defaultContext])).value ?? EMPTY
}

const EMPTY: DefaultContext = {
    initialContext: [],
    corpusContext: [],
}
