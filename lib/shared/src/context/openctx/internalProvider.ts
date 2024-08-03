import type {
    Mention,
    MentionsParams,
    MentionsResult,
    Provider,
    ProviderSettings,
} from '@openctx/client'
import { isContextItemType } from '../../codebase-context/messages'
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
    if (!mention.data) {
        return false
    }
    if (
        !(
            'contextItem' in mention.data &&
            mention.data.contextItem &&
            typeof mention.data.contextItem === 'object'
        )
    ) {
        return false
    }
    if (!('uri' in mention.data.contextItem && typeof mention.data.contextItem.uri === 'string')) {
        return false
    }
    if (
        !(
            'type' in mention.data.contextItem &&
            typeof mention.data.contextItem.type === 'string' &&
            isContextItemType(mention.data.contextItem.type)
        )
    ) {
        return false
    }
    return true
}
