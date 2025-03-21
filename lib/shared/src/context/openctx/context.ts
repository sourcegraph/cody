import { URI } from 'vscode-uri'
import { type ContextItemOpenCtx, ContextItemSource } from '../../codebase-context/messages'
import { logDebug } from '../../logger'
import { currentOpenCtxController } from './api'

// getContextForChatMessage returns context items for a given chat message from the OpenCtx providers.
export const getContextForChatMessage = async (
    message: string,
    parentSignal?: AbortSignal
): Promise<ContextItemOpenCtx[]> => {
    // Create a dependent abort controller that aborts if the parent aborts
    // but doesn't propagate its own aborts back to the parent
    const controller = new AbortController()
    if (parentSignal) {
        parentSignal.addEventListener('abort', () => controller.abort())
    }
    try {
        const openCtxClient = currentOpenCtxController()
        if (!openCtxClient) {
            return []
        }

        // get list of all configured OpenCtx providers.
        // All operations below use the parentSignal but we catch and handle all errors
        // to prevent them from propagating up the chain
        const providers = await openCtxClient.meta({}).catch(() => [])
        if (parentSignal?.aborted) return []

        // filter providers that have message selectors configured and match the message text.
        const matchingProviders = providers.filter(
            p =>
                p.items?.messageSelectors?.filter(({ pattern }) => {
                    try {
                        return message.match(new RegExp(pattern))?.length
                    } catch {
                        // Log the error but don't propagate it
                        logDebug(
                            'OpenCtx',
                            `getContextForChatMessage Error: matching regex ${pattern} for provider ${p.providerUri}`
                        )
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
        if (parentSignal?.aborted) return []

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
                        source: ContextItemSource.User, // To indicate that this is a user-added item.
                    }) satisfies ContextItemOpenCtx
            )
    } catch {
        return []
    }
}
