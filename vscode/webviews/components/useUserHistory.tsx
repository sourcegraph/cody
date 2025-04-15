import type { LightweightChatHistory } from '@sourcegraph/cody-shared/src/chat/transcript'
import { useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useMemo } from 'react'

/**
 * React hook to query for user local history.
 */
export function useUserHistory(): LightweightChatHistory | null | undefined {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory])).value
}
