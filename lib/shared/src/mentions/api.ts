import type { MetaResult } from '@openctx/client'
import { openCtx } from '../context/openctx/api'
import { logDebug } from '../logger'

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
export async function allMentionProvidersMetadata(): Promise<ContextMentionProviderMetadata[]> {
    const items = [
        FILE_CONTEXT_MENTION_PROVIDER,
        SYMBOL_CONTEXT_MENTION_PROVIDER,
        ...(await openCtxMentionProviders()),
    ]

    return items
}

// Cody Web providers don't include standard file provider since
// it uses openctx remote file provider instead
export async function webMentionProvidersMetadata(): Promise<ContextMentionProviderMetadata[]> {
    return [SYMBOL_CONTEXT_MENTION_PROVIDER, ...(await openCtxMentionProviders())]
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

async function openCtxMentionProviders(): Promise<ContextMentionProviderMetadata[]> {
    const client = openCtx.client
    if (!client) {
        return []
    }

    try {
        const providers = await client.meta({})

        return providers
            .filter(provider => !!provider.mentions)
            .map(openCtxProviderMetadata)
            .sort((a, b) => (a.title > b.title ? 1 : -1))
    } catch (error) {
        logDebug('openctx', `Failed to fetch OpenCtx providers: ${error}`)
        return []
    }
}
