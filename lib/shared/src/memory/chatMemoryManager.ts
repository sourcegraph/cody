import { Memory } from './memory'

export class ChatMemoryManager {
    private memory: Memory
    constructor() {
        this.memory = new Memory()
    }

    public getDocument(id: string) {
        return this.memory.getDocument(id)
    }

    public addDocument(item: MemoryDocument) {
        this.memory.addDocument(item)
    }

    public removeDocument(id: string) {
        this.memory.removeDocument(id)
    }

    public toJSON() {
        return this.memory.toJSON()
    }

    public fromJSON(data: any) {
        this.memory.fromJSON(data)
    }

    public search(query: string, topK: number) {
        return this.memory.search(query, topK)
    }
}
