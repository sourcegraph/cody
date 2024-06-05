import { ChatMemoryManager } from '@sourcegraph/cody-shared'

import type { Item, Provider } from '@openctx/client'
import { authProvider } from '../../services/AuthProvider'
import { localStorage } from '../../services/LocalStorageProvider'

// EXPERIMENTAL: This context provider brings in context items by searching across all the chats saved in memory.
// This includes context files, human messages and assistant messages.
const GlobalChatMemoryProvider: Provider & {
    providerUri: string
} = {
    providerUri: 'internal-global-chat-memory',

    meta() {
        return { name: 'Chat Memory', mentions: {} }
    },

    async mentions() {
        return [
            {
                title: 'memory',
                uri: 'memory',
            },
        ]
    },

    async items({ message }) {
        if (!message) {
            return []
        }

        const authStatus = await authProvider?.getAuthStatus()
        if (!authStatus) {
            return []
        }

        const memoryManager = new ChatMemoryManager({
            authStatus,
            localStorage: localStorage,
        })

        const results = await memoryManager.getContextItemsFromGlobalMemory(message?.toString())

        return results.map(
            result =>
                ({
                    url: result.uri.toString(),
                    title: result.title || result.uri.toString(),
                    ai: {
                        content: result.content || undefined,
                    },
                }) satisfies Item
        )
    },
}

export default GlobalChatMemoryProvider
