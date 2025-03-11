import type { MetaResult } from '@openctx/client'
import { type Observable, map } from 'observable-fns'
import {
    GIT_OPENCTX_PROVIDER_URI,
    RECENTLY_USED_PROVIDER_URI,
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

/**
 * Default order for context mention providers.
 * Providers will be sorted based on their position in this array.
 * Providers not in this list will be placed at the end.
 */
export const DEFAULT_PROVIDER_ORDER: ContextMentionProviderID[] = [
    RECENTLY_USED_PROVIDER_URI,
    REMOTE_REPOSITORY_PROVIDER_URI,
    'file',
    'symbol',
    WEB_PROVIDER_URI,
    GIT_OPENCTX_PROVIDER_URI,
]

export function mentionProvidersMetadata(options?: {
    disableProviders: ContextMentionProviderID[]
}): Observable<ContextMentionProviderMetadata[]> {
    return openCtxMentionProviders().map(providers =>
        [...[FILE_CONTEXT_MENTION_PROVIDER, SYMBOL_CONTEXT_MENTION_PROVIDER], ...providers]
            .filter(provider => !options?.disableProviders?.includes(provider.id))
            .sort((a, b) => {
                const indexA = DEFAULT_PROVIDER_ORDER.indexOf(a.id)
                const indexB = DEFAULT_PROVIDER_ORDER.indexOf(b.id)

                if (indexA >= 0 && indexB >= 0) {
                    return indexA - indexB
                }

                if (indexA >= 0) return -1
                if (indexB >= 0) return 1

                return 0
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
