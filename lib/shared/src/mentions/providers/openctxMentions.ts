import { URI } from 'vscode-uri'
import { ContextItemSource, type ContextItemWithContent } from '../../codebase-context/messages'
import type { OpenCtxExtensionAPI } from '../../context/openctx/api'
import type { ContextItemFromProvider, ContextMentionProvider } from '../api'

export function createOpenCtxMentionProvider(
    getOpenCtxExtensionAPI: () => Promise<OpenCtxExtensionAPI>
): ContextMentionProvider<'openctx'> {
    return {
        id: 'openctx',
        triggerPrefixes: ['gdoc:'],
        async queryContextItems(query, signal) {
            const openctxAPI = await getOpenCtxExtensionAPI()
            const results = await openctxAPI.getItems({ query: query.replace(/^gdoc:/, '') })
            const items =
                results?.map(
                    result =>
                        ({
                            type: 'file',
                            source: ContextItemSource.Search,
                            title: result.title,
                            uri: URI.parse(result.url ?? 'https://example.com'),
                            provider: 'openctx',
                            content: result.ai?.content,
                            repoName: 'Google Doc',
                        }) satisfies ContextItemWithContent & ContextItemFromProvider<'openctx'>
                ) ?? []
            HACK_LAST_RESULTS = items
            return items
        },
        resolveContextItem(item, input, signal) {
            return Promise.resolve(
                HACK_LAST_RESULTS.filter(({ uri }) => item.uri.toString() === uri.toString())
            )
        },
    }
}

let HACK_LAST_RESULTS: ContextItemWithContent[] & ContextItemFromProvider<'openctx'>[] = []
