import { URI } from 'vscode-uri'
import type { ContextItemWithContent } from '../../codebase-context/messages'
import { isDefined } from '../../common'
import { openCtx } from '../../context/openctx/api'
import type { ContextItemFromProvider, ContextMentionProvider } from '../api'

export const OPENCTX_CONTEXT_MENTION_PROVIDER: ContextMentionProvider<'openctx'> = {
    id: 'openctx',
    title: 'OpenCtx',
    async queryContextItems(query) {
        const client = openCtx.client
        if (!client) {
            return []
        }
        const results = await client.mentions({ query })
        const items =
            results?.map(
                result =>
                    ({
                        type: 'openctx',
                        title: result.title,
                        uri: URI.parse(result.uri),
                        providerUri: result.providerUri,
                        provider: 'openctx',
                    }) satisfies ContextItemFromProvider<'openctx'>
            ) ?? []
        return items
    },
    async resolveContextItem(item, message) {
        const client = openCtx.client
        if (!client) {
            return []
        }

        if (item.type !== 'openctx') {
            return []
        }

        const mention = { ...item, uri: item.uri.toString() }

        const items = await client.items({ message: message.toString(), mention }, item.providerUri)

        return (
            items
                .map(result =>
                    result.ai?.content
                        ? ({
                              type: 'file',
                              title: result.title,
                              uri: URI.parse(result.url || ''),
                              content: result.ai.content,
                              provider: 'openctx',
                          } satisfies ContextItemWithContent)
                        : null
                )
                .filter(isDefined) ?? []
        )
    },
}
