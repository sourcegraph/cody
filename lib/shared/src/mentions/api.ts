import type { MetaResult } from '@openctx/client'
import { type Observable, map } from 'observable-fns'
import {
    GIT_OPENCTX_PROVIDER_URI,
    REMOTE_REPOSITORY_PROVIDER_URI,
    WEB_PROVIDER_URI,
    openctxController,
} from '../context/openctx/api'
import { distinctUntilChanged, switchMap } from '../misc/observable'

/**
 * Props required by context item providers to return possible context items.
 */
export interface ContextItemProps {
    gitRemotes: { hostname: string; owner: string; repoName: string; url: string }[]
}

/**
 * Metadata about a {@link ContextMentionProvider}.
 */
export interface ContextMentionProviderMetadata {
    id: string

    /**
     * A short, human-readable display title for the provider, such as "Google Docs".
     */
    title: string

    /**
     * Human-readable display string for when the user is querying items from this provider.
     */
    queryLabel: string

    /**
     * Human-readable display string for when the provider has no items for the query.
     */
    emptyLabel: string
}

/**
 * A unique identifier for a {@link ContextMentionProvider}.
 */
export type ContextMentionProviderID = ContextMentionProviderMetadata['id']

export const FILE_CONTEXT_MENTION_PROVIDER: ContextMentionProviderMetadata & { id: 'file' } = {
    id: 'file',
    title: 'Files',
    queryLabel: 'Search for a file to include...',
    emptyLabel: 'No files found',
}

export const SYMBOL_CONTEXT_MENTION_PROVIDER: ContextMentionProviderMetadata & { id: 'symbol' } = {
    id: 'symbol',
    title: 'Symbols',
    queryLabel: 'Search for a symbol to include...',
    emptyLabel: 'No symbols found',
}

export const FREQUENTLY_USED_CONTEXT_MENTION_PROVIDER: ContextMentionProviderMetadata & {
    id: 'frequentlyUsed'
} = {
    id: 'frequentlyUsed',
    title: 'Frequently Used',
    queryLabel: 'Search for a frequently used item to include...',
    emptyLabel: 'No frequently used items found',
}

/**
 * Default order for context mention providers.
 * Providers will be sorted based on their position in this array.
 * Providers not in this list will be placed at the end.
 */
export const DEFAULT_PROVIDER_ORDER: ContextMentionProviderID[] = [
    FREQUENTLY_USED_CONTEXT_MENTION_PROVIDER.id,
    REMOTE_REPOSITORY_PROVIDER_URI,
    FILE_CONTEXT_MENTION_PROVIDER.id,
    SYMBOL_CONTEXT_MENTION_PROVIDER.id,
    WEB_PROVIDER_URI,
    GIT_OPENCTX_PROVIDER_URI,
]

export function mentionProvidersMetadata(options?: {
    query?: string
    experimentalPromptEditor?: boolean
    disableProviders: ContextMentionProviderID[]
}): Observable<ContextMentionProviderMetadata[]> {
    return openCtxMentionProviders().map(providers =>
        [
            ...(options?.experimentalPromptEditor ? [FREQUENTLY_USED_CONTEXT_MENTION_PROVIDER] : []),
            ...[FILE_CONTEXT_MENTION_PROVIDER, SYMBOL_CONTEXT_MENTION_PROVIDER],
            ...providers,
        ]
            .filter(provider => {
                // Filter out providers that have been explicitly disabled
                if (options?.disableProviders?.includes(provider.id)) {
                    return false
                }

                // If a query is provided, filter providers based on whether any word in their title
                // starts with the query (case-insensitive)
                if (options?.query) {
                    const queryLower = options.query.toLowerCase()

                    return provider.title
                        .toLowerCase()
                        .split(/\s+/)
                        .some(word => word.startsWith(queryLower))
                }

                return true
            })
            .sort((a, b) => {
                // If a search query is provided, sort alphabetically by title
                if (options?.query) {
                    return a.title.localeCompare(b.title)
                }

                // Otherwise, sort based on the DEFAULT_PROVIDER_ORDER array
                const indexA = DEFAULT_PROVIDER_ORDER.indexOf(a.id)
                const indexB = DEFAULT_PROVIDER_ORDER.indexOf(b.id)

                // If both providers are in the DEFAULT_PROVIDER_ORDER array,
                // sort by their position in the array
                if (indexA >= 0 && indexB >= 0) {
                    return indexA - indexB
                }

                // Providers in the DEFAULT_PROVIDER_ORDER array come before those that aren't
                if (indexA >= 0) return -1
                if (indexB >= 0) return 1

                // For providers not in the DEFAULT_PROVIDER_ORDER array,
                // are sorted alphabetically by title
                return a.title.localeCompare(b.title)
            })
    )
}

export function openCtxProviderMetadata(
    meta: MetaResult & { providerUri: string }
): ContextMentionProviderMetadata {
    return {
        id: meta.providerUri,
        title: meta.name,
        queryLabel: meta.mentions?.label ?? 'Search...',
        emptyLabel: 'No results',
    }
}

function openCtxMentionProviders(): Observable<ContextMentionProviderMetadata[]> {
    return openctxController.pipe(
        switchMap(c =>
            c.metaChanges({}, {}).pipe(
                map(providers =>
                    providers
                        .filter(provider => !!provider.mentions)
                        .map(openCtxProviderMetadata)
                        .sort((a, b) => (a.title > b.title ? 1 : -1))
                ),
                distinctUntilChanged()
            )
        )
    )
}
