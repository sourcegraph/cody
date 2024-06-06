import {
    type ContextItem,
    type ContextMentionProviderMetadata,
    displayLineRange,
    displayPathBasename,
} from '@sourcegraph/cody-shared'
import { useMemo, useState } from 'react'
import { useClientState } from '../../client/clientState'
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
    quickPickItems?: ContextItem[]
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
    const queryLower = params.query?.toLowerCase()?.trim() ?? null

    const { providers } = useContextProviders()
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
            quickPickItems: clientState.availableEditorContext
                .map(item => {
                    const menuItem = prepareContextItemForMentionMenu(item, remainingTokenBudget)
                    if (menuItem.type === 'file') {
                        menuItem.title = menuItem.range ? '@currentSelection' : '@currentFile'
                        menuItem.description =
                            displayPathBasename(menuItem.uri) +
                            (menuItem.range ? `:${displayLineRange(menuItem.range)}` : '')
                    }
                    if (menuItem.type === 'repository' || menuItem.type === 'tree') {
                        menuItem.title = `@${menuItem.title}`
                    }
                    return menuItem
                })
                .filter(item =>
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
