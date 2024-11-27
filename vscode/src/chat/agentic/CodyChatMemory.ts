import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { localStorage } from '../../services/LocalStorageProvider'

/**
 * CodyChatMemory is a singleton class that manages short-term memory storage for chat conversations.
 * It maintains a maximum of 8 most recent memory items in a static Store.
 * We store the memory items in local storage to persist them across sessions.
 * NOTE: The memory items set to a maximum of 8 to avoid overloading the local storage.
 *
 * @remarks
 * This class should never be instantiated directly. All operations should be performed
 * through static methods. The only instance creation happens internally during initialization.
 *
 * Key features:
 * - Maintains a static Set of up to 8 chat memory items
 * - Persists memory items to local storage
 * - Provides memory retrieval as ContextItem for chat context
 *
 * Usage:
 * - Call CodyChatMemory.initialize() once at startup
 * - Use static methods load(), retrieve(), and unload() for memory operations
 */
export class CodyChatMemory {
    private static readonly MAX_MEMORY_ITEMS = 8
    private static Store = new Set<string>([])

    public static initialize(): void {
        if (CodyChatMemory.Store.size === 0) {
            const newMemory = new CodyChatMemory()
            CodyChatMemory.Store = new Set(newMemory.getChatMemory())
        }
    }

    public static load(memory: string): void {
        CodyChatMemory.Store.add(memory)
        // If store exceeds the max, remove oldest items
        if (CodyChatMemory.Store.size > CodyChatMemory.MAX_MEMORY_ITEMS) {
            const storeArray = Array.from(CodyChatMemory.Store)
            CodyChatMemory.Store = new Set(storeArray.slice(-5))
        }
        // TODO - persist to local file system
        localStorage?.setChatMemory(Array.from(CodyChatMemory.Store))
    }

    public static retrieve(): ContextItem | undefined {
        return CodyChatMemory.Store.size > 0
            ? {
                  type: 'file',
                  content: Array.from(CodyChatMemory.Store).join('\n'),
                  uri: URI.file('MEMORY'),
                  source: ContextItemSource.Agentic,
                  title: 'Chat Memory',
              }
            : undefined
    }

    public static unload(): ContextItem | undefined {
        const stored = CodyChatMemory.retrieve()
        CodyChatMemory.Store = new Set<string>()
        return stored
    }

    private getChatMemory(): string[] {
        return localStorage?.getChatMemory() || []
    }
}