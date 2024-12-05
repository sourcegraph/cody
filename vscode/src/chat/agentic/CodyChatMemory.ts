import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { localStorage } from '../../services/LocalStorageProvider'

/**
 * CodyChatMemory is a static utility class that manages persistent chat memory storage.
 * It maintains the 10 most recent memory items using a static Map and localStorage for persistence.
 *
 * The class handles:
 * - Memory persistence across sessions via localStorage
 * - Automatic trimming to maintain the 10 most recent items
 * - Timestamp-based memory organization
 * - Context retrieval for chat interactions
 *
 * Key Features:
 * - Static interface - all operations performed through static methods
 * - Automatic initialization on first use
 * - Memory items formatted with timestamps
 * - Integration with chat context system via ContextItem format
 *
 * Usage:
 * - CodyChatMemory.initialize() - Called at startup to load existing memories
 * - CodyChatMemory.load(memory) - Add new memory
 * - CodyChatMemory.retrieve() - Get memories as chat context
 * - CodyChatMemory.reset() - Clear and return last state
 */
export class CodyChatMemory {
    private static readonly MAX_MEMORY_ITEMS = 10
    private static Store = new Map<string, string>()

    public static initialize(): void {
        if (CodyChatMemory.Store.size === 0) {
            const newMemory = new CodyChatMemory()
            const memories = newMemory.getChatMemory()
            CodyChatMemory.Store = new Map(
                memories.map(memory => {
                    const [timestamp, ...content] = memory.split('\n')
                    return [timestamp.replace('## ', ''), content.join('\n')]
                })
            )
        }
    }

    public static load(memory: string): void {
        const timestamp = new Date().toISOString()
        CodyChatMemory.Store.set(timestamp, memory)
        // Convert existing entries to array for manipulation
        const entries = Array.from(CodyChatMemory.Store.entries())
        // Keep only the most recent MAX_MEMORY_ITEMS entries &
        // update stores with trimmed entries
        const trimmedEntries = entries.slice(-CodyChatMemory.MAX_MEMORY_ITEMS)
        CodyChatMemory.Store = new Map(trimmedEntries)
        localStorage?.setChatMemory(
            Array.from(trimmedEntries.entries()).map(([ts, mem]) => `## ${ts}\n${mem}`)
        )
    }

    public static retrieve(): ContextItem | undefined {
        return CodyChatMemory.Store.size > 0
            ? {
                  type: 'file',
                  content: populateMemoryContent(CodyChatMemory.Store),
                  uri: URI.file('Cody Memory'),
                  source: ContextItemSource.Agentic,
                  title: 'Cody Chat Memory',
              }
            : undefined
    }

    public static reset(): ContextItem | undefined {
        const stored = CodyChatMemory.retrieve()
        CodyChatMemory.Store.clear()
        return stored
    }

    private getChatMemory(): string[] {
        return localStorage?.getChatMemory() || []
    }
}

export const CHAT_MEMORY_CONTEXT_TEMPLATE = `# Chat Memory
Here are the notes you made about the user (me) from previous chat:
{memoryItems}`

function populateMemoryContent(memoryMap: Map<string, string>): string {
    const memories = Array.from(memoryMap.entries())
        .map(([timestamp, content]) => `\n## ${timestamp}\n${content}`)
        .join('')

    return CHAT_MEMORY_CONTEXT_TEMPLATE.replace('{memoryItems}', memories)
}
