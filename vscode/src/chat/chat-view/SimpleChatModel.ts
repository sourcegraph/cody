export class SimpleChatModel {
    public context: ContextItem[] = []
    public messages: Message[] = []

    public addHumanMessage(message: Omit<Message, 'speaker'>): void {
        if (this.messages.at(-1)?.speaker === 'human') {
            throw new Error('Cannot add a user message after a user message')
        }
        this.messages.push({
            speaker: 'human',
            ...message,
        })
    }

    public addBotMessage(message: Omit<Message, 'speaker'>): void {
        if (this.messages.at(-1)?.speaker === 'assistant') {
            throw new Error('Cannot add a bot message after a bot message')
        }
        this.messages.push({
            speaker: 'assistant',
            ...message,
        })
    }
}

interface ContextItem {
    uri: string
    fsPathRelativeToRepoRoot: string
    range: Range
    text: string
}

interface ContextReference {
    uri: string
    startOffset: number
    endOffset: number
}

export interface PromptMaker {
    makePrompt(chat: SimpleChatModel): string
}

export class GPT4PromptMaker implements PromptMaker {
    public makePrompt(chat: SimpleChatModel): string {
        return 'TODO'
    }
}

interface Message {
    speaker: 'human' | 'assistant'
    text: string
    contextReferences: { uri: string; startOffset: number; endOffset: number }[]
}
