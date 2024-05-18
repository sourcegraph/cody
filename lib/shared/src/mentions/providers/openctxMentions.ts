import { URI } from 'vscode-uri'
import type { ContextItemWithContent } from '../../codebase-context/messages'
import { isDefined } from '../../common'
import { getOpenCtxClient } from '../../context/openctx/api'
import type { ContextItemFromProvider, ContextMentionProvider } from '../api'

export const OPENCTX_CONTEXT_MENTION_PROVIDER: ContextMentionProvider<'openctx'> = {
    id: 'openctx',
    title: 'OpenCtx',
    async queryContextItems(query) {
        const client = getOpenCtxClient()
        if (!client) {
            return []
        }
        const results = await client.mentions({ query: query })
        const mentions =
            results
                ?.map(
                    (result, i) =>
                        ({
                            type: 'file',
                            title: result.title,
                            uri: URI.parse(result.uri ?? `openctx-item:${i}`),
                            provider: 'openctx',
                            content: '',
                        }) satisfies ContextItemWithContent & ContextItemFromProvider<'openctx'>
                )
                .filter(isDefined) ?? []
        HACK_LAST_RESULTS = mentions
        return mentions
    },
    resolveContextItem(item) {
        return Promise.resolve(
            HACK_LAST_RESULTS.filter(({ uri }) => item.uri.toString() === uri.toString())
        )
    },
}

let HACK_LAST_RESULTS: ContextItemWithContent[] & ContextItemFromProvider<'openctx'>[] = []
