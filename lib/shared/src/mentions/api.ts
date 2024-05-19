import type { ContextItem, ContextItemWithContent } from '../codebase-context/messages'
import type { Configuration } from '../configuration'
import { openCtx } from '../context/openctx/api'
import type { PromptString } from '../prompt/prompt-string'
import { GITHUB_CONTEXT_MENTION_PROVIDER } from './providers/githubMentions'
import { PACKAGE_CONTEXT_MENTION_PROVIDER } from './providers/packageMentions'
import { SOURCEGRAPH_SEARCH_CONTEXT_MENTION_PROVIDER } from './providers/sourcegraphSearch'
import { URL_CONTEXT_MENTION_PROVIDER } from './providers/urlMentions'

/**
 * A unique identifier for a {@link ContextMentionProvider}.
 */
export type ContextMentionProviderID = string

/**
 * Providers that supply context that the user can @-mention in chat.
 *
 * This API is *experimental* and subject to rapid, unannounced change.
 *
 */
export const CONTEXT_MENTION_PROVIDERS: ContextMentionProvider[] = [
    URL_CONTEXT_MENTION_PROVIDER,
    PACKAGE_CONTEXT_MENTION_PROVIDER,
    SOURCEGRAPH_SEARCH_CONTEXT_MENTION_PROVIDER,
    GITHUB_CONTEXT_MENTION_PROVIDER,
]

/**
 * A provider that can supply context for users to @-mention in chat.
 *
 * This API is *experimental* and subject to rapid, unannounced change.
 */
export interface ContextMentionProvider<ID extends ContextMentionProviderID = ContextMentionProviderID> {
    id: ID

    /**
     * A short, human-readable display title for the provider, such as "Google Docs". If not given,
     * `id` is used instead.
     */
    title?: string

    /**
     * Human-readable display string for when the user is querying items from this provider.
     */
    queryLabel?: string

    /**
     * Human-readable display string for when the provider has no items for the query.
     */
    emptyLabel?: string

    /**
     * Get a list of possible context items to show (in a completion menu) when the user triggers
     * this provider while typing `@` in a chat message.
     *
     * {@link query} omits the `@`.
     */
    queryContextItems(
        query: string,
        props: ContextItemProps,
        signal?: AbortSignal
    ): Promise<ContextItemFromProvider<ID>[]>

    /**
     * Resolve a context item to one or more items that have the {@link ContextItem.content} field
     * filled in. A provider is called to resolve only the context items that it returned in
     * {@link queryContextItems} and that the user explicitly added.
     */
    resolveContextItem?(
        item: ContextItemFromProvider<ID>,
        input: PromptString,
        signal?: AbortSignal
    ): Promise<ContextItemWithContent[]>
}

/**
 * Props required by context item providers to return possible context items.
 */
export interface ContextItemProps {
    gitRemotes: { hostname: string; owner: string; repoName: string; url: string }[]
}

export type ContextItemFromProvider<ID extends ContextMentionProviderID> = ContextItem & {
    /**
     * The ID of the {@link ContextMentionProvider} that supplied this context item.
     */
    provider: ID
}

/**
 * Metadata about a {@link ContextMentionProvider}.
 */
export interface ContextMentionProviderMetadata<
    ID extends ContextMentionProviderID = ContextMentionProviderID,
> extends Pick<ContextMentionProvider<ID>, 'id' | 'title' | 'queryLabel' | 'emptyLabel'> {}

export const FILE_CONTEXT_MENTION_PROVIDER: ContextMentionProviderMetadata<'file'> = {
    id: 'file',
    title: 'Files',
    queryLabel: 'Search for a file to include...',
    emptyLabel: 'No files found',
}

export const SYMBOL_CONTEXT_MENTION_PROVIDER: ContextMentionProviderMetadata<'symbol'> = {
    id: 'symbol',
    title: 'Symbols',
    queryLabel: 'Search for a symbol to include...',
    emptyLabel: 'No symbols found',
}

/** Metadata for all registered {@link ContextMentionProvider}s. */
export async function allMentionProvidersMetadata(
    config: Pick<Configuration, 'experimentalNoodle' | 'experimentalURLContext'>
): Promise<ContextMentionProviderMetadata[]> {
    const items = [
        FILE_CONTEXT_MENTION_PROVIDER,
        SYMBOL_CONTEXT_MENTION_PROVIDER,
        ...(await openCtxMentionProviders()),
        /*
        ...CONTEXT_MENTION_PROVIDERS.filter(
            ({ id }) =>
                config.experimentalNoodle ||
                (id === URL_CONTEXT_MENTION_PROVIDER.id && config.experimentalURLContext)
        ),
    */
    ]

    return items
}

export async function openCtxMentionProviders(): Promise<ContextMentionProviderMetadata[]> {
    const client = openCtx.client
    if (!client) {
        return []
    }

    const providers = await client.meta({})

    return providers
        .filter(provider => provider.features?.mentions)
        .map(provider => ({
            id: provider.providerUri,
            title: provider.name + ' (by OpenCtx)',
            queryLabel: `Search using ${provider.name} provider`,
            emptyLabel: 'No results found',
        }))
}
