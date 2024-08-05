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
    const data = mention.data
    if (!('contextItem' in mention.data && mention.data.contextItem)) {
        return false
    }
    const contextItem = data.contextItem
    if (
        !(
            contextItem &&
            typeof contextItem === 'object' &&
            'type' in contextItem &&
            'uri' in contextItem
        )
    ) {
        return false
    }
    const { type, uri } = contextItem
    if (!(typeof type === 'string' && typeof uri === 'string')) {
        return false
    }
    if (!isContextItemType(type)) {
        return false
    }
    ;({ ...mention, data: { contextItem: { type, uri } } }) satisfies MentionWithContextItemData
    return true
}
