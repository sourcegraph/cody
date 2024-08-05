import { URI } from 'vscode-uri'
import type { ContextItemOpenCtx } from '../../codebase-context/messages'
import { openCtx } from './api'

// getContextForChatMessage returns context items for a given chat message from the OpenCtx providers.
export const getContextForChatMessage = async (
    message: string,
    signal?: AbortSignal
): Promise<ContextItemOpenCtx[]> => {
    try {
        const openCtxClient = openCtx.controller
        if (!openCtxClient) {
            return []
        }

        // get list of all configured OpenCtx providers.
        const providers = await openCtxClient.meta({})
        signal?.throwIfAborted()

        // filter providers that have message selectors configured and match the message text.
        const matchingProviders = providers.filter(
            p =>
                p.items?.messageSelectors?.filter(({ pattern }) => {
                    try {
                        return message.match(new RegExp(pattern))?.length
                    } catch {
                        return []
                    }
                })?.length
        )

        // get list of items from each matching provider.
        const items = (
            await Promise.all(
                matchingProviders.map(({ providerUri }) =>
                    openCtxClient.items({ message }, { providerUri }).catch(() => [])
                )
            )
        ).flat()
        // TODO(sqs): add abort signal to openCtxClient.items API
        signal?.throwIfAborted()

        return items
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
    } catch {
        return []
    }
}
