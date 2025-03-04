import type { LightweightUserHistory } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { type UseObservableResult, useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useMemo } from 'react'

/**
 * React hook to query for user local history.
 */
export function useUserHistory(): UseObservableResult<LightweightUserHistory | null | undefined> {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory]))
}
