import { URI } from 'vscode-uri'
import type { AuthStatus } from '../auth/types'
import type { ChatMessage } from '../chat/transcript/messages'
import type { ContextItem, ContextItemMemory } from '../codebase-context/messages'
import { Memory, type MemoryDocument, type MemoryStorage } from './memory'

export interface ChatMemoryManagerConfig {
    authStatus: AuthStatus
    localStorage: ChatMemoryLocalStorage
}

export interface ChatMemoryLocalStorage {
    getChatMemory(authStatus: AuthStatus): MemoryStorage | null
    clearChatMemory(authStatus: AuthStatus): Promise<void>
    setChatMemory(authStatus: AuthStatus, memory: MemoryStorage | null): Promise<void>
}
export interface ChatMessageDocument extends ChatMessage {
    conversationID: string
    messageID: string
}

export class ChatMemoryManager {
    private readonly memory: Memory
    private readonly config: ChatMemoryManagerConfig
    constructor(config: ChatMemoryManagerConfig) {
        this.config = config
        this.memory = new Memory()
        this.loadMemoryFromLocalStorage()
    }

    private loadMemoryFromLocalStorage = () => {
        const memoryStorage = this.config.localStorage.getChatMemory(this.config.authStatus)
        if (memoryStorage) {
            this.memory.loadJSON(memoryStorage)
        }
    }

    private saveMemoryToLocalStorage = async (): Promise<void> => {
        const serializedMemory = this.memory.toJSON()
        return this.config.localStorage.setChatMemory(this.config.authStatus, serializedMemory)
    }

    public saveChatMessage = async (message: ChatMessageDocument): Promise<void> => {
        const documents: MemoryDocument[] = []

        if (message.text?.toString()) {
            // add chat message document
            documents.push({
                type: message.speaker === 'human' ? 'humanMessage' : 'assistantMessage',
                id: toChatMessageDocumentID(message),
                conversationID: message.conversationID,
                messageID: message.messageID,
                content: message.text.toString(),
            })
        }

        message.contextFiles?.map((contextItem, index) => {
            // do not include context items without content or with memory type
            if (!contextItem.content || contextItem.type === 'memory') {
                return
            }
            // add context items document
            documents.push({
                type: 'contextItem',
                id: toContextItemDocumentID(message, contextItem),
                conversationID: message.conversationID,
                messageID: message.messageID,
                content: contextItem.content,
                title: contextItem.title,
                url: contextItem.uri.toString(),
            })
        })

        return await Promise.all(
            documents.map(async document => {
                if (await this.memory.hasDocument(document.id)) {
                    return this.memory.updateDocument(document)
                }

                return this.memory.addDocument(document)
            })
        ).then(this.saveMemoryToLocalStorage)
    }

    public removeChatMessage = async (message: ChatMessageDocument): Promise<void> => {
        const documentsToRemove = (await this.memory.getDocuments()).filter(
            document =>
                document.conversationID === message.conversationID &&
                document.messageID === message.messageID
        )

        return Promise.all(
            documentsToRemove.map(document => this.memory.removeDocument(document.id))
        ).then(this.saveMemoryToLocalStorage)
    }

    public removeChat = async (conversationID: string): Promise<void> => {
        const documentsToRemove = (await this.memory.getDocuments()).filter(
            document => document.conversationID === conversationID
        )

        return Promise.all(
            documentsToRemove.map(document => this.memory.removeDocument(document.id))
        ).then(this.saveMemoryToLocalStorage)
    }

    public removeAllChats = async (): Promise<void> => {
        this.memory.resetIndex()
        return await this.config.localStorage.clearChatMemory(this.config.authStatus)
    }
    public getContextItemsFromChatMemory = async (
        query: string,
        conversationID: string
    ): Promise<ContextItem[]> => {
        // The results will be scoped to the context items from that conversation.
        const results = await this.memory.search(query, {
            topK: 5,
            includeConversationIDs: [conversationID],
            types: ['contextItem'],
        })

        return results.map(
            result =>
                ({
                    type: 'memory',
                    conversationID: result.document.conversationID,
                    messageID: result.document.messageID,
                    uri: URI.parse(result.document.url || ''),
                    title: toContextItemTitle(result.document),
                    content: result.document.content,
                }) satisfies ContextItemMemory
        )
    }

    public getContextItemsFromGlobalMemory = async (query: string): Promise<ContextItemMemory[]> => {
        // The results will be scoped global memory and will include context items, human messages and assistant responses.
        const results = await this.memory.search(query, {
            topK: 5,
        })

        return results.map(
            result =>
                ({
                    type: 'memory',
                    conversationID: result.document.conversationID,
                    messageID: result.document.messageID,
                    uri: URI.parse(result.document.url || ''),
                    title: toContextItemTitle(result.document),
                    content: result.document.content,
                }) satisfies ContextItemMemory
        )
    }
}

function toChatMessageDocumentID(message: ChatMessageDocument): string {
    return `chat:${message.conversationID};message:${message.messageID};speaker:${message.speaker}`
}

function toContextItemDocumentID(message: ChatMessageDocument, contextItem: ContextItem): string {
    // We index context items separately for each chat message, and not globally
    // against the URI. This redundancy ensures that if chats or messages are
    // deleted, the context items which still belong to other chat messages are
    // kept available.
    const id = `chat:${message.conversationID};message:${
        message.messageID
    };context_item:${contextItem.uri.toString()}`

    if (contextItem.range) {
        return `${id}:${contextItem.range.start.line}:${contextItem.range.end.line}`
    }

    return id
}

function toContextItemTitle(message: MemoryDocument): string {
    switch (message.type) {
        case 'contextItem':
            return `From memory: ${message.title || message.url}`
        default:
            return `Chat message: ${message.content.slice(0, 50)}...`
    }
}
