import type { UserLocalHistory } from '@sourcegraph/cody-shared'
import { type UseObservableResult, useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useMemo } from 'react'

/**
 * React hook to query for user local history.
 */
export function useUserHistory(): UseObservableResult<UserLocalHistory | null | undefined> {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory]))
}
