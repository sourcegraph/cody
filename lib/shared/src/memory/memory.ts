import lunr, { type SearchResults, type SerialisedIndexData } from 'elasticlunr'
export interface MemoryDocument {
    id: string
    url?: string
    title: string
    content: string
}

export interface MemorySearchResult extends SearchResults {
    document: MemoryDocument
}

export class Memory {
    private index: lunr.Index<MemoryDocument>
    constructor() {
        this.index = lunr(function () {
            this.setRef('id')
            this.addField('url')
            this.addField('title')
            this.addField('content')
        })
    }

    public getDocument(id: string): MemoryDocument {
        return this.index.documentStore.getDoc(id)
    }

    public addDocument(item: MemoryDocument) {
        this.index.addDoc(item)
    }
    public removeDocument(id: string) {
        this.index.removeDocByRef(id)
    }

    public toJSON(): SerialisedIndexData<MemoryDocument> {
        return this.index.toJSON()
    }

    public fromJSON(data: any) {
        this.index = lunr.Index.load(data)
    }

    public search(query: string, topK: number): MemorySearchResult[] {
        return this.index
            .search(query, {
                fields: {
                    url: {},
                    title: {},
                    content: {},
                },
                expand: true,
            })
            .slice(0, topK)
            .map(
                result =>
                    ({
                        ...result,
                        document: this.index.documentStore.getDoc(result.ref),
                    }) satisfies MemorySearchResult
            )
    }
}
