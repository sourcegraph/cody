import type { ContextItem } from '../../codebase-context/messages'
import type { ContextMentionProviderMetadata } from '../../mentions/api'
import type { MentionQuery } from '../../mentions/query'

export interface WebviewToExtensionAPI {
    mentionProviders(): AsyncGenerator<ContextMentionProviderMetadata[]>
    contextItems(query: MentionQuery): AsyncGenerator<ContextItem[]>
}
