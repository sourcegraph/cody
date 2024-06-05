import lunr from 'elasticlunrjs'
import type { Index, SearchResults, SerialisedIndexData } from 'elasticlunrjs'
import type { ContextItem } from '../codebase-context/messages'
import { isDefined } from '../common'

/*
const lunr = require('elasticlunrjs') as (
    config?: (this: Index<MemoryDocument>, idx: elasticlunr.Index<MemoryDocument>) => void
) => Index<MemoryDocument>
*/
if (typeof window !== 'undefined') {
    ;(window as any).lunr = lunr || {}
}

if (typeof global !== 'undefined') {
    ;(global as any).lunr = lunr || {}
}
if (typeof globalThis !== 'undefined') {
    ;(globalThis as any).lunr = lunr || {}
}

export type MemoryDocumentType = 'humanMessage' | 'assistantMessage' | 'contextItem'
export interface MemoryDocument {
    id: string
    content: string
    type: MemoryDocumentType
    conversationID: string
    messageID: string
    url?: string
    title?: string
    contextItem?: ContextItem & { content?: undefined }
}

export interface MemorySearchOptions {
    topK: number
    includeConversationIDs?: string[]
    excludeConversationIDs?: string[]
    types?: MemoryDocumentType[]
}

export interface MemorySearchResult extends SearchResults {
    document: MemoryDocument
}

export type MemoryStorage = SerialisedIndexData<MemoryDocument>

export class Memory {
    // EXPERIMENTAL: The library used for search is elasticlunr.
    // The interface exposed by the Memory class is intentionally kept async, even
    // though the underlying library is synchronous, to ensure future compatibility.
    // This way, changes won't be needed if the implementation becomes asynchronous
    // in the future.
    private index: Index<MemoryDocument>

    constructor() {
        this.index = this.createIndex()
    }

    public async getDocuments(): Promise<MemoryDocument[]> {
        return Promise.resolve(Object.values(this.index.documentStore.toJSON().docs))
    }
    public async getDocument(id: string): Promise<MemoryDocument | null> {
        return Promise.resolve(this.index.documentStore.getDoc(id))
    }

    public hasDocument(id: string): Promise<boolean> | boolean {
        return Promise.resolve(this.index.documentStore.hasDoc(id))
    }

    public async addDocument(document: MemoryDocument): Promise<void> {
        return Promise.resolve(this.index.addDoc(document))
    }
    public async removeDocument(id: string): Promise<void> {
        return Promise.resolve(this.index.removeDocByRef(id))
    }
    public async updateDocument(document: MemoryDocument): Promise<void> {
        return Promise.resolve(this.index.updateDoc(document))
    }

    public async search(query: string, options: MemorySearchOptions): Promise<MemorySearchResult[]> {
        const index = this.index

        return Promise.resolve(
            index
                .search(query, {
                    fields: {
                        title: { boost: 2 },
                        content: { boost: 1 },
                    },
                    expand: true,
                })
                .map(result => {
                    const document = index.documentStore.getDoc(result.ref)

                    if (options.types?.length && !options.types.includes(document.type)) {
                        return null
                    }

                    if (
                        options.includeConversationIDs?.length &&
                        !options.includeConversationIDs.includes(document.conversationID)
                    ) {
                        return null
                    }

                    if (
                        options.excludeConversationIDs?.length &&
                        options.excludeConversationIDs.includes(document.conversationID)
                    ) {
                        return null
                    }

                    return {
                        ...result,
                        document,
                    } satisfies MemorySearchResult
                })
                .filter(isDefined)
                .slice(0, options.topK)
        )
    }

    private createIndex(): Index<MemoryDocument> {
        return lunr(function () {
            this.setRef('id')
            this.addField('type')
            this.addField('content')
            this.addField('conversationID')
            this.addField('messageID')
            this.addField('url')
            this.addField('title')
            return
        })
    }

    public resetIndex() {
        this.index = this.createIndex()
    }

    public toJSON(): MemoryStorage {
        return this.index.toJSON()
    }

    public loadJSON(storage: MemoryStorage) {
        this.index = lunr.Index.load(storage)
    }
}
