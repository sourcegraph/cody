import type { ContextItem, ContextMentionProviderMetadata } from '@sourcegraph/cody-shared'
import { useMemo, useState } from 'react'
import { useChatContextItems } from '../../promptEditor/plugins/atMentions/chatContextClient'
import { prepareContextItemForMentionMenu } from '../../promptEditor/plugins/atMentions/util'
import { useContextProviders } from '../providers'

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

    return useMemo(
        () => ({
            params,
            updateQuery: query => setParams(prev => ({ ...prev, query })),
            updateMentionMenuParams: update => setParams(prev => ({ ...prev, ...update })),
        }),
        [params]
    )
}

export interface MentionMenuData {
    providers: ContextMentionProviderMetadata[]
    items: ContextItem[] | undefined
}

export interface MentionMenuContextValue {
    updateMentionMenuParams: (update: Partial<Pick<MentionMenuParams, 'parentItem'>>) => void
    setEditorQuery: (query: string) => void
}

export function useMentionMenuData(
    params: MentionMenuParams,
    { remainingTokenBudget, limit }: { remainingTokenBudget: number; limit: number }
): MentionMenuData {
    const results = useChatContextItems(params.query, params.parentItem)
    const queryLower = params.query?.toLowerCase() ?? null

    const { providers } = useContextProviders()

    return useMemo(
        () => ({
            providers:
                params.parentItem || queryLower === null
                    ? []
                    : providers.filter(
                          provider =>
                              provider.id.toLowerCase().includes(queryLower) ||
                              provider.title?.toLowerCase().includes(queryLower)
                      ),
            items: results
                ?.slice(0, limit)
                .map(item => prepareContextItemForMentionMenu(item, remainingTokenBudget)),
        }),
        [params.parentItem, providers, queryLower, results, limit, remainingTokenBudget]
    )
}
