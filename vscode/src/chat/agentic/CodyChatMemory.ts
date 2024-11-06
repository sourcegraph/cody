import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { localStorage } from '../../services/LocalStorageProvider'

export class CodyChatMemory {
    private static Store = new Set<string>()

    public static load(memory: string): void {
        CodyChatMemory.Store.add(memory)
        // If store exceeds 5 items, remove oldest items
        if (CodyChatMemory.Store.size > 5) {
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
                  uri: URI.file('cody-memory'),
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

    constructor() {
        const stored = localStorage?.getChatMemory()
        if (stored) {
            CodyChatMemory.Store = new Set(stored)
        }
    }
}
