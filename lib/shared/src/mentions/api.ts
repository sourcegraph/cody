import type { ContextItem, ContextItemWithContent } from '../codebase-context/messages'
import { PROMPT_MIXIN_MENTION_PROVIDER } from './providers/promptMixinMentions'
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
 * In VS Code, use {@link getEnabledContextMentionProviders} instead of this.
 */
export const CONTEXT_MENTION_PROVIDERS: ContextMentionProvider[] = [
    URL_CONTEXT_MENTION_PROVIDER,
    PROMPT_MIXIN_MENTION_PROVIDER,
]

export interface ContextMentionProviderInformation<
    ID extends ContextMentionProviderID = ContextMentionProviderID,
> {
    id: ID

    /**
     * A description of this provider that can be used to make this provider discoverable
     */
    description: string

    /**
     * A codicon for this provider
     */
    icon: string

    /**
     * Prefix strings for the user input after the `@` that trigger this provider. For example, a
     * context mention provider with prefix `npm:` would be triggered when the user types `@npm:`.
     */
    triggerPrefixes: string[]
}
/**
 * A provider that can supply context for users to @-mention in chat.
 *
 * This API is *experimental* and subject to rapid, unannounced change.
 */
export interface ContextMentionProvider<ID extends ContextMentionProviderID = ContextMentionProviderID> {
    id: ID

    /**
     * Prefix strings for the user input after the `@` that trigger this provider. For example, a
     * context mention provider with prefix `npm:` would be triggered when the user types `@npm:`.
     */
    triggerPrefixes: string[]

    // Information to help with discovery
    /**
     * A description of this provider that can be used to make this provider discoverable
     */
    description?: string

    /**
     * A codicon for this provider
     */
    icon?: string

    /**
     * Get a list of possible context items to show (in a completion menu) when the user triggers
     * this provider while typing `@` in a chat message.
     *
     * {@link query} omits the `@` but includes the trigger prefix from {@link triggerPrefixes}.
     */
    queryContextItems(query: string, signal?: AbortSignal): Promise<ContextItemFromProvider<ID>[]>

    /**
     * Resolve a context item to one or more items that have the {@link ContextItem.content} field
     * filled in. A provider is called to resolve only the context items that it returned in
     * {@link queryContextItems} and that the user explicitly added.
     */
    resolveContextItem?(
        item: ContextItemFromProvider<ID>,
        signal?: AbortSignal
    ): Promise<ContextItemWithContent[]>
}

export type ContextItemFromProvider<ID extends ContextMentionProviderID> = ContextItem & {
    /**
     * The ID of the {@link ContextMentionProvider} that supplied this context item.
     */
    provider: ID
}
