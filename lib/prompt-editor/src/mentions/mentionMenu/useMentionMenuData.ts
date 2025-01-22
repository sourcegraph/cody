import type {
    ContextItem,
    ContextMentionProviderMetadata,
    MentionMenuData,
    MentionQuery,
} from '@sourcegraph/cody-shared'
import {
    ContextItemSource,
    REMOTE_DIRECTORY_PROVIDER_URI,
    REMOTE_FILE_PROVIDER_URI,
    REMOTE_REPOSITORY_PROVIDER_URI,
    memoizeLastValue,
    parseMentionQuery,
} from '@sourcegraph/cody-shared'
import debounce from 'lodash/debounce'
import { useCallback, useContext, useMemo, useState } from 'react'
import { ChatMentionContext } from '../../plugins/atMentions/useChatContextItems'
import { useExtensionAPI } from '../../useExtensionAPI'
import { useDefaultContextForChat } from '../../useInitialContext'
import { type UseObservableResult, useObservable } from '../../useObservable'

export interface MentionMenuParams {
    query: string | null
    interactionID?: number | null | undefined
    parentItem: ContextMentionProviderMetadata | null
}

export function useMentionMenuParams(): {
    params: MentionMenuParams
    updateQuery: (query: string | null) => void
    updateMentionMenuParams: MentionMenuContextValue['updateMentionMenuParams']
} {
    const mentionSettings = useContext(ChatMentionContext)
    const [params, setParams] = useState<MentionMenuParams>({
        query: null,
        parentItem: null,
        interactionID: null,
    })

    const isRemoteLikeProviderActive =
        mentionSettings.resolutionMode === 'remote' ||
        [
            REMOTE_FILE_PROVIDER_URI,
            REMOTE_DIRECTORY_PROVIDER_URI,
            REMOTE_REPOSITORY_PROVIDER_URI,
        ].includes(params.parentItem?.id || '')

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

interface MentionMenuContextValue {
    updateMentionMenuParams: (
        update: Partial<Pick<MentionMenuParams, 'parentItem' | 'interactionID'>>
    ) => void
    setEditorQuery: (query: string) => void
}

export function useMentionMenuData(
    params: MentionMenuParams,
    { remainingTokenBudget, limit }: { remainingTokenBudget: number; limit: number }
): MentionMenuData {
    const { value, error } = useCallMentionMenuData(params)
    const queryLower = params.query?.toLowerCase()?.trim() ?? null

    const isInProvider = !!params.parentItem

    // Initial context items aren't filtered when we receive them, so we need to filter them here.
    const defaultContext = useDefaultContextForChat()
    const initialContext = [...defaultContext.initialContext, ...defaultContext.corpusContext]
    const filteredInitialContextItems = isInProvider
        ? []
        : initialContext.filter(item =>
              queryLower
                  ? item.title?.toLowerCase().includes(queryLower) ||
                    item.uri.toString().toLowerCase().includes(queryLower) ||
                    item.description?.toString().toLowerCase().includes(queryLower)
                  : true
          )

    const additionalItems =
        value?.items
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
            .map(item => prepareUserContextItem(item, remainingTokenBudget)) ?? []

    return useMemo(
        () =>
            ({
                providers: value?.providers ?? [],
                items: [...filteredInitialContextItems, ...additionalItems],
                error: value?.error ?? (error ? `Unexpected error: ${error}` : undefined),
            }) satisfies MentionMenuData,
        [value, error, filteredInitialContextItems, additionalItems]
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

/**
 * @internal
 */
export function useCallMentionMenuData({
    query,
    parentItem: provider,
    interactionID,
}: MentionMenuParams): UseObservableResult<MentionMenuData> {
    const mentionSettings = useContext(ChatMentionContext)
    const unmemoizedCall = useExtensionAPI().mentionMenuData
    const memoizedCall = useMemo(
        () =>
            mentionSettings.resolutionMode === 'local'
                ? memoizeLastValue(unmemoizedCall, ([query]) => JSON.stringify(query))
                : unmemoizedCall,
        [unmemoizedCall, mentionSettings]
    )

    const mentionQuery: MentionQuery = useMemo(
        () => ({
            ...parseMentionQuery(query ?? '', provider),
            interactionID: interactionID ?? undefined,
            contextRemoteRepositoriesNames: mentionSettings.remoteRepositoriesNames,
        }),
        [query, provider, interactionID, mentionSettings]
    )

    return useObservable(
        useMemo(() => memoizedCall(mentionQuery), [memoizedCall, mentionQuery]),
        { preserveValueKey: mentionQuery.provider ?? undefined }
    )
}
