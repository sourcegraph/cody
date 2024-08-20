import type { EachWithProviderUri, MetaResult } from '@openctx/client'
import { Observable } from 'observable-fns'
import { openCtx } from '../context/openctx/api'
import { fromRxJSObservable } from '../misc/observable'

/**
 * A unique identifier for a {@link ContextMentionProvider}.
 */
export type ContextMentionProviderID = string

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

/** Metadata for all registered {@link ContextMentionProvider}s. */
export function allMentionProvidersMetadata(): Observable<ContextMentionProviderMetadata[]> {
    return openCtxMentionProviders().map(providers => [
        FILE_CONTEXT_MENTION_PROVIDER,
        SYMBOL_CONTEXT_MENTION_PROVIDER,
        ...providers,
    ])
}

// Cody Web providers don't include standard file provider since
// it uses openctx remote file provider instead
export function webMentionProvidersMetadata(): Observable<ContextMentionProviderMetadata[]> {
    return openCtxMentionProviders().map(providers => [SYMBOL_CONTEXT_MENTION_PROVIDER, ...providers])
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

    return fromRxJSObservable<EachWithProviderUri<MetaResult[]>>(controller.metaChanges({}, {})).map(
        providers =>
            providers
                .filter(provider => !!provider.mentions)
                .map(openCtxProviderMetadata)
                .sort((a, b) => (a.title > b.title ? 1 : -1))
    )
}
