import type { LightweightUserHistory, PaginatedHistoryResult } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { type UseObservableResult, useExtensionAPI, useObservable } from '@sourcegraph/prompt-editor'
import { useMemo } from 'react'

/**
 * React hook to query for user local history.
 * @deprecated Use usePaginatedHistory instead for better performance with large histories
 */
export function useUserHistory(): UseObservableResult<LightweightUserHistory | null | undefined> {
    const userHistory = useExtensionAPI().userHistory
    return useObservable(useMemo(() => userHistory(), [userHistory]))
}

/**
 * React hook that loads a paginated portion of user history.
 * This is more efficient than loading the entire history at once.
 * 
 * @param page Page number (1-based)
 * @param pageSize Number of items per page
 * @param searchTerm Optional search term to filter chats
 */
export function usePaginatedHistory(
    page: number, 
    pageSize: number, 
    searchTerm?: string
): UseObservableResult<PaginatedHistoryResult> {
    const api = useExtensionAPI()
    const paginatedUserHistory = api.paginatedUserHistory
    
    return useObservable(
        useMemo(() => paginatedUserHistory(page, pageSize, searchTerm), 
        [paginatedUserHistory, page, pageSize, searchTerm])
    )
}
