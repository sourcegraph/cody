import type { ContextItem, ContextMentionProviderMetadata } from '@sourcegraph/cody-shared'
import {
    ContextItemSource,
    REMOTE_FILE_PROVIDER_URI,
    REMOTE_REPOSITORY_PROVIDER_URI,
} from '@sourcegraph/cody-shared'
import { debounce } from 'lodash'
import { useCallback, useContext, useMemo, useState } from 'react'
import { useClientState } from '../../clientState'
import { ChatMentionContext, useChatContextItems } from '../../plugins/atMentions/useChatContextItems'
import { useAsyncGenerator } from '../../useAsyncGenerator'
import { useExtensionAPI } from '../../useExtensionAPI'

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
    items: (ContextItem & { icon?: string })[] | undefined

    /**
     * If an error is present, the client should display the error *and* still display the other
     * data that is present.
     */
    error?: string
}

interface MentionMenuContextValue {
    updateMentionMenuParams: (update: Partial<Pick<MentionMenuParams, 'parentItem'>>) => void
    setEditorQuery: (query: string) => void
}

export function useMentionMenuData(
    params: MentionMenuParams,
    { remainingTokenBudget, limit }: { remainingTokenBudget: number; limit: number }
): MentionMenuData {
    const { value: contextItems, error: contextItemsError } = useChatContextItems(
        params.query,
        params.parentItem
    )
    const queryLower = params.query?.toLowerCase()?.trim() ?? null

    const { value: providers, error: providersError } = useAsyncGenerator(
        useExtensionAPI().mentionProviders
    )
    const clientState = useClientState()

    const isInProvider = !!params.parentItem

    // Initial context items aren't filtered when we receive them, so we need to filter them here.
    const filteredInitialContextItems = isInProvider
        ? []
        : clientState.initialContext.filter(item =>
              queryLower
                  ? item.title?.toLowerCase().includes(queryLower) ||
                    item.uri.toString().toLowerCase().includes(queryLower) ||
                    item.description?.toString().toLowerCase().includes(queryLower)
                  : true
          )

    return useMemo(
        () =>
            ({
                providers:
                    isInProvider || queryLower === null || !providers
                        ? []
                        : providers.filter(
                              provider =>
                                  provider.id.toLowerCase().includes(queryLower) ||
                                  provider.title?.toLowerCase().includes(queryLower) ||
                                  provider.id.toLowerCase().replaceAll(' ', '').includes(queryLower) ||
                                  provider.title?.toLowerCase().replaceAll(' ', '').includes(queryLower)
                          ),
                items: [
                    ...filteredInitialContextItems,
                    ...(contextItems
                        ?.filter(
                            // If an item is shown as initial context, don't show it twice.
                            item =>
                                !filteredInitialContextItems.some(
                                    initialItem =>
                                        initialItem.uri.toString() === item.uri.toString() &&
                                        initialItem.type === item.type
                                )
                        )
                        .slice(0, limit)
                        .map(item => prepareUserContextItem(item, remainingTokenBudget)) ?? []),
                ],
                error: (contextItemsError ?? providersError)?.message,
            }) satisfies MentionMenuData,
        [
            isInProvider,
            providers,
            providersError,
            queryLower,
            contextItems,
            contextItemsError,
            filteredInitialContextItems,
            limit,
            remainingTokenBudget,
        ]
    )
}

function prepareUserContextItem(item: ContextItem, remainingTokenBudget: number): ContextItem {
    return {
        ...item,
        isTooLarge: item.size !== undefined ? item.size > remainingTokenBudget : item.isTooLarge,

        // All @-mentions should have a source of `User`.
        source: ContextItemSource.User,
    }
}
