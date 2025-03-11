import { type UserLocalHistory } from '@sourcegraph/cody-shared'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useMemo } from 'react'

/**
 * Hook to access user chat history
 */
export function useUserHistory(): UserLocalHistory | null | undefined {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory])).value
}