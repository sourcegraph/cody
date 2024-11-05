import { type ContextItem, ContextItemSource } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import { localStorage } from '../../services/LocalStorageProvider'

export class CodyChatMemory {
    private static Store = new Set<string>()

    public static load(memory: string): void {
        CodyChatMemory.Store.add(memory)
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

    private readonly STORAGE_KEY = 'cody-chat-memory'

    constructor() {
        const stored = localStorage?.get<string[]>(this.STORAGE_KEY)
        if (stored) {
            CodyChatMemory.Store = new Set(stored)
        }
    }

    public store(): void {
        localStorage?.set(this.STORAGE_KEY, Array.from(CodyChatMemory.Store))
    }
}
