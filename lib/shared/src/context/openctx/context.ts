import { URI } from 'vscode-uri'
import type { ContextItemDoc } from '../../codebase-context/messages'
import type { OpenCtxExtensionAPI } from './api'

export async function getOpenCtxContextItems(
    openctxAPI: OpenCtxExtensionAPI,
    query: string,
    maxResults = 20
): Promise<ContextItemDoc[]> {
    if (!query.trim()) {
        return []
    }

    const items = await openctxAPI.getItems({ query })
    const contextItems: ContextItemDoc[] = []
    if (items) {
        for (const item of items.slice(0, maxResults)) {
            contextItems.push({
                type: 'doc',
                title: item.title,
                uri: URI.parse(item.url ?? 'https://example.com'),
                content: item.ai?.content ?? '',
            })
        }
    }

    return contextItems
}
