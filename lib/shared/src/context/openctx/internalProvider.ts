import type {
    Mention,
    MentionsParams,
    MentionsResult,
    Provider,
    ProviderSettings,
} from '@openctx/client'
import type { SerializedContextItem } from '../../lexicalEditor/nodes'

/**
 * An OpenCtx provider implemented internally.
 */
export interface InternalOpenCtxProvider extends Provider {
    providerUri: string

    /**
     * Internal mention providers can return {@link MentionWithContextItemData} to make it easier to
     * convert to our {@link ContextItem} type.
     */
    mentions?(
        params: MentionsParams,
        settings: ProviderSettings
    ):
        | MentionsResult
        | Promise<MentionsResult>
        | MentionWithContextItemData[]
        | Promise<MentionWithContextItemData[]>
}

/**
 * An OpenCtx mention whose {@link Mention.data} contains a {@link ContextItem}.
 */
export interface MentionWithContextItemData extends Mention {
    data: {
        contextItem: SerializedContextItem
    }
}

export function isMentionWithContextItemData(mention: Mention): mention is MentionWithContextItemData {
    return Boolean(
        // biome-ignore lint/complexity/useOptionalChain:
        mention.data !== undefined &&
            mention.data.contextItem &&
            typeof mention.data.contextItem === 'object' &&
            typeof (mention.data.contextItem as any).uri === 'string'
    )
}
