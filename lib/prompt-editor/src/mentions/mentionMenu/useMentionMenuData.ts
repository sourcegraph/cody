import type { ContextItem, ContextMentionProviderMetadata } from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import { useCallback, useMemo, useState } from 'react'
import { useClientState } from '../../clientState'
import {
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
    const [params, setParams] = useState<MentionMenuParams>({ query: null, parentItem: null })

    const updateQuery = useCallback(
        debounce((query: string | null) => setParams(prev => ({ ...prev, query })), 300),
        []
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
