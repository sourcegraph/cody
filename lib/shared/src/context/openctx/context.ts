import { URI } from 'vscode-uri'
import type { ContextItemOpenCtx } from '../../codebase-context/messages'
import { logDebug } from '../../logger'
import { openCtx } from './api'

export const getContextForChatMessage = async (message: string): Promise<ContextItemOpenCtx[]> => {
    const openCtxClient = openCtx.client
    if (!openCtxClient) {
        return []
    }

    const providers = await openCtxClient.meta({})

    const matchingProviders = providers.filter(
        p =>
            p.items?.messageSelectors?.filter(
                ({ pattern }) => message.match(new RegExp(pattern))?.length
            )?.length
    )

    const items = (
        await Promise.all(
            matchingProviders.map(({ providerUri }) => openCtxClient.items({ message }, { providerUri }))
        )
    )
        .flat()
        .filter(item => item.ai?.content)
        .map(
            item =>
                ({
                    type: 'openctx',
                    title: item.title,
                    uri: URI.parse(item.url || item.providerUri),
                    providerUri: item.providerUri,
                    content: item.ai?.content || '',
                    provider: 'openctx',
                }) as ContextItemOpenCtx
        )

    return items
}
