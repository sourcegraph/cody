import type { ContextItem, ContextMentionProviderMetadata } from '@sourcegraph/cody-shared'
import { REMOTE_FILE_PROVIDER_URI, REMOTE_REPOSITORY_PROVIDER_URI } from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import { useCallback, useContext, useMemo, useState } from 'react'
import { useClientState } from '../../clientState'
import {
    ChatMentionContext,
    useChatContextItems,
    useChatContextMentionProviders,
} from '../../plugins/atMentions/chatContextClient'
import { prepareContextItemForMentionMenu } from '../../plugins/atMentions/util'

export interface MentionMenuParams {
    query: string | null
    parentItem: ContextMentionProviderMetadata | null
}

export function useMentionMenuParams(): {
    params: MentionMenuParams
    updateQuery: (query: string | null) => void
    updateMentionMenuParams: MentionMenuContextValue['updateMentionMenuParams']
} {
    const mentionSettings = useContext(ChatMentionContext)
    const [params, setParams] = useState<MentionMenuParams>({ query: null, parentItem: null })

    const isRemoteLikeProviderActive =
        mentionSettings.resolutionMode === 'remote' ||
        params.parentItem?.id === REMOTE_FILE_PROVIDER_URI ||
        params.parentItem?.id === REMOTE_REPOSITORY_PROVIDER_URI

    // Increase debounce time in case of remote context item resolution (Cody Web case) or
    // in case of remote-like providers such as remote repositories or remote files
    const debounceTime: number = isRemoteLikeProviderActive ? 300 : 10

    const debouncedUpdateQuery = useMemo(
        () => debounce((query: string | null) => setParams(prev => ({ ...prev, query })), debounceTime),
        [debounceTime]
    )

    const updateQuery = useCallback(
        (query: string | null) => {
            // Update query immediately if it's an initial query state
            if (!query) {
                debouncedUpdateQuery(query)
                debouncedUpdateQuery.flush()
                return
            }

            debouncedUpdateQuery(query)
        },
        [debouncedUpdateQuery]
    )

    return useMemo(
        () => ({
            params,
            updateQuery,
            updateMentionMenuParams: update => setParams(prev => ({ ...prev, ...update })),
        }),
        [params, updateQuery]
    )
}

export interface MentionMenuData {
    providers: ContextMentionProviderMetadata[]
    initialContextItems?: (ContextItem & { icon?: string })[]
    items: ContextItem[] | undefined
}

interface MentionMenuContextValue {
    updateMentionMenuParams: (update: Partial<Pick<MentionMenuParams, 'parentItem'>>) => void
    setEditorQuery: (query: string) => void
}

export function useMentionMenuData(
    params: MentionMenuParams,
    { remainingTokenBudget, limit }: { remainingTokenBudget: number; limit: number }
): MentionMenuData {
    const results = useChatContextItems(params.query, params.parentItem)
    const queryLower = params.query?.toLowerCase()?.trim() ?? null

    const { providers } = useChatContextMentionProviders()
    const clientState = useClientState()

    return useMemo(
        () => ({
            providers:
                params.parentItem || queryLower === null
                    ? []
                    : providers.filter(
                          provider =>
                              provider.id.toLowerCase().includes(queryLower) ||
                              provider.title?.toLowerCase().includes(queryLower) ||
                              provider.id.toLowerCase().replaceAll(' ', '').includes(queryLower) ||
                              provider.title?.toLowerCase().replaceAll(' ', '').includes(queryLower)
                      ),
            items: results
                ?.slice(0, limit)
                .filter(
                    // If an item is in the initial context, don't show it twice.
                    item =>
                        !clientState.initialContext.some(
                            initialItem =>
                                initialItem.uri.toString() === item.uri.toString() &&
                                initialItem.type === item.type
                        )
                )
                .map(item => prepareContextItemForMentionMenu(item, remainingTokenBudget)),
            initialContextItems: clientState.initialContext.filter(item =>
                queryLower
                    ? item.title?.toLowerCase().includes(queryLower) ||
                      item.uri.toString().toLowerCase().includes(queryLower) ||
                      item.description?.toString().toLowerCase().includes(queryLower)
                    : true
            ),
        }),
        [params.parentItem, providers, queryLower, results, limit, remainingTokenBudget, clientState]
    )
}
