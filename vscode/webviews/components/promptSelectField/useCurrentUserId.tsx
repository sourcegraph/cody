import { type UseObservableResult, useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useMemo } from 'react'

/**
 * React hook to query for prompts in the prompt library.
 */
export function useCurrentUserId(): UseObservableResult<string | null | Error> {
    const currentUserId = useExtensionAPI().getCurrentUserId
    return useObservable(useMemo(() => currentUserId(), [currentUserId]))
}
