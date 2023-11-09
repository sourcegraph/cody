export class SimpleChatModel {
    // TODO: pass context as non-message
    public context: Message[] = []

    public messages: Message[] = []

    public addHumanMessage(message: Message): void {
        // TODO
    }

    public addBotMessage(message: Message): void {
        // TODO
    }
}

interface PromptMaker {
    makePrompt(chat: SimpleChatModel): string
}

// class GPT4PromptMaker implements PromptMaker {
// }

interface Message {
    speaker: string
    content: string
    context: {
        fileRanges: { [id: string]: string }
    }
}
