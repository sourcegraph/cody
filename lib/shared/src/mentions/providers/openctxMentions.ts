import { URI } from 'vscode-uri'
import type { ContextItemWithContent } from '../../codebase-context/messages'
import { isDefined } from '../../common'
import { getOpenCtxExtensionAPI } from '../../context/openctx/api'
import type { ContextItemFromProvider, ContextMentionProvider } from '../api'

export const OPENCTX_CONTEXT_MENTION_PROVIDER: ContextMentionProvider<'openctx'> = {
    id: 'openctx',
    title: 'OpenCtx',
    async queryContextItems(query) {
        const openctxAPI = await getOpenCtxExtensionAPI()
        if (!openctxAPI) {
            return []
        }
        const results = await openctxAPI.getItems({ query: query })
        const items =
            results
                ?.map((result, i) =>
                    result.ai?.content
                        ? ({
                              type: 'file',
                              title: result.title,
                              uri: URI.parse(result.url ?? `openctx-item:${i}`),
                              provider: 'openctx',
                              content: result.ai?.content,
                          } satisfies ContextItemWithContent & ContextItemFromProvider<'openctx'>)
                        : null
                )
                .filter(isDefined) ?? []
        HACK_LAST_RESULTS = items
        return items
    },
    resolveContextItem(item) {
        return Promise.resolve(
            HACK_LAST_RESULTS.filter(({ uri }) => item.uri.toString() === uri.toString())
        )
    },
}

let HACK_LAST_RESULTS: ContextItemWithContent[] & ContextItemFromProvider<'openctx'>[] = []
