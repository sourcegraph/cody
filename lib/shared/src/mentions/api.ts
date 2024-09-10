import type { MetaResult } from '@openctx/client'
import { Observable, map } from 'observable-fns'
import { openCtx } from '../context/openctx/api'
import { distinctUntilChanged } from '../misc/observable'

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

export function mentionProvidersMetadata(options?: {
    disableProviders: ContextMentionProviderID[]
}): Observable<ContextMentionProviderMetadata[]> {
    return openCtxMentionProviders().map(providers =>
        [...[FILE_CONTEXT_MENTION_PROVIDER, SYMBOL_CONTEXT_MENTION_PROVIDER], ...providers].filter(
            provider => !options?.disableProviders.includes(provider.id)
        )
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
    const controller = openCtx.controller
    if (!controller) {
        return Observable.of([])
    }

    return controller.metaChanges({}, {}).pipe(
        map(providers =>
            providers
                .filter(provider => !!provider.mentions)
                .map(openCtxProviderMetadata)
                .sort((a, b) => (a.title > b.title ? 1 : -1))
        ),
        distinctUntilChanged()
    )
}
