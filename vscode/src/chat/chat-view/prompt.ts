import {
    isMarkdownFile,
    populateCodeContextTemplate,
    populateMarkdownContextTemplate,
} from '@sourcegraph/cody-shared/src/prompt/templates'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { ContextItem, contextItemId, MessageWithContext, SimpleChatModel } from './SimpleChatModel'

export interface IContextProvider {
    // Context explicitly specified by user
    getUserContext(): ContextItem[]

    // Context reflecting the current editor state
    getUserAttentionContext(): ContextItem[]

    // Context fetched from the broader repository
    getEnhancedContext(query: string): Promise<ContextItem[]>
}

export interface IPrompter {
    makePrompt(
        chat: SimpleChatModel,
        contextProvider: IContextProvider,
        byteLimit: number
    ): Promise<{
        prompt: Message[]
        warnings: string[]
        newContextUsed: ContextItem[]
    }>
}

export class DefaultPrompter implements IPrompter {
    public async makePrompt(
        chat: SimpleChatModel,
        contextProvider: IContextProvider,
        byteLimit: number
    ): Promise<{
        prompt: Message[]
        warnings: string[]
        newContextUsed: ContextItem[]
    }> {
        const { reversePrompt, warnings, newContextUsed } = await this.makeReversePrompt(
            chat,
            contextProvider,
            byteLimit
        )
        return {
            prompt: [...reversePrompt].reverse(),
            warnings,
            newContextUsed,
        }
    }

    // Constructs the raw prompt to send to the LLM, with message order reversed, so we can construct
    // an array with the most important messages (which appear most important first in the reverse-prompt.
    //
    // Returns the reverse prompt, a list of warnings that indicate that the prompt was truncated, and
    // the new context that was used in the prompt for the current message.
    private async makeReversePrompt(
        chat: SimpleChatModel,
        contextProvider: IContextProvider,
        byteLimit: number
    ): Promise<{
        reversePrompt: Message[]
        warnings: string[]
        newContextUsed: ContextItem[]
    }> {
        const promptBuilder = new PromptBuilder(byteLimit)
        const newContextUsed: ContextItem[] = []
        const warnings: string[] = []

        // Add existing transcript messages
        const reverseTranscript: MessageWithContext[] = [...chat.getMessagesWithContext()].reverse()
        for (let i = 0; i < reverseTranscript.length; i++) {
            const messageWithContext = reverseTranscript[i]
            const contextLimitReached = promptBuilder.tryAdd(messageWithContext.message)
            if (!contextLimitReached) {
                warnings.push(`Ignored ${reverseTranscript.length - i} transcript messages due to context limit`)
                return {
                    reversePrompt: promptBuilder.reverseMessages,
                    warnings,
                    newContextUsed,
                }
            }
        }

        {
            // Add context from new user-specified context items
            const { limitReached, used } = promptBuilder.tryAddContext(
                contextProvider.getUserContext(),
                (item: ContextItem) => this.renderContextItem(item)
            )
            newContextUsed.push(...used)
            if (limitReached) {
                warnings.push('Ignored current user-specified context items due to context limit')
                return { reversePrompt: promptBuilder.reverseMessages, warnings, newContextUsed }
            }
        }

        {
            // Add context from previous messages
            const { limitReached } = promptBuilder.tryAddContext(
                reverseTranscript.flatMap((message: MessageWithContext) => message.newContextUsed || []),
                (item: ContextItem) => this.renderContextItem(item)
            )
            if (limitReached) {
                warnings.push('Ignored prior context items due to context limit')
                return { reversePrompt: promptBuilder.reverseMessages, warnings, newContextUsed }
            }
        }

        // If not the first message, don't add additional context
        // const firstMessageWithContext = chat.getMessagesWithContext().at(0)

        // TODO(beyang): This condition is not correct; if enhanced context is
        // turned on then additional context should be included.

        // if (!firstMessageWithContext?.message.text || chat.getMessagesWithContext().length !== 1) {
        //    return {
        //        reversePrompt: promptBuilder.reverseMessages,
        //        warnings,
        //        newContextUsed,
        //    }
        // }

        // Note, this is not the first message but the most recent message;
        // minimizing the diff with #1717.
        const firstMessageWithContext = reverseTranscript[0]
        if (!firstMessageWithContext?.message.text) {
            return {
                reversePrompt: promptBuilder.reverseMessages,
                warnings,
                newContextUsed,
            }
        }

        // Add additional context from current editor or broader search
        const additionalContextItems: ContextItem[] = []
        // TODO(beyang): This should consider the most recent message, not the first.
        if (isEditorContextRequired(firstMessageWithContext.message.text)) {
            additionalContextItems.push(...contextProvider.getUserAttentionContext())
        }
        // TODO(beyang): This search query should be for the most recent message, not the first.
        additionalContextItems.push(...(await contextProvider.getEnhancedContext(firstMessageWithContext.message.text)))
        const { limitReached, used } = promptBuilder.tryAddContext(additionalContextItems, (item: ContextItem) =>
            this.renderContextItem(item)
        )
        newContextUsed.push(...used)
        if (limitReached) {
            warnings.push('Ignored additional context items due to context limit')
        }

        return {
            reversePrompt: promptBuilder.reverseMessages,
            warnings,
            newContextUsed,
        }
    }

    private renderContextItem(contextItem: ContextItem): Message[] {
        let messageText: string
        if (isMarkdownFile(contextItem.uri.fsPath)) {
            messageText = populateMarkdownContextTemplate(contextItem.text, contextItem.uri.fsPath)
        } else {
            messageText = populateCodeContextTemplate(contextItem.text, contextItem.uri.fsPath)
        }
        return [
            { speaker: 'human', text: messageText },
            { speaker: 'assistant', text: 'Ok.' },
        ]
    }
}

class PromptBuilder {
    public reverseMessages: Message[] = []
    private bytesUsed = 0
    private seenContext = new Set<string>()
    constructor(private readonly byteLimit: number) {}
    public tryAdd(message: Message): boolean {
        const lastMessage = this.reverseMessages.at(-1)
        if (lastMessage?.speaker === message.speaker) {
            throw new Error('Cannot add message with same speaker as last message')
        }

        const msgLen = message.speaker.length + (message.text?.length || 0) + 3 // space and 2 newlines
        if (this.bytesUsed + msgLen > this.byteLimit) {
            return false
        }
        this.reverseMessages.push(message)
        this.bytesUsed += msgLen
        return true
    }

    public tryAddContext(
        contextItems: ContextItem[],
        renderContextItem: (contextItem: ContextItem) => Message[]
    ): {
        limitReached: boolean
        used: ContextItem[]
        ignored: ContextItem[]
        duplicate: ContextItem[]
    } {
        let limitReached = false
        const used: ContextItem[] = []
        const ignored: ContextItem[] = []
        const duplicate: ContextItem[] = []
        for (const contextItem of contextItems) {
            const id = contextItemId(contextItem)
            if (this.seenContext.has(id)) {
                duplicate.push(contextItem)
                continue
            }
            const contextMessages = renderContextItem(contextItem).reverse()
            const contextLen = contextMessages.reduce(
                (acc, msg) => acc + msg.speaker.length + (msg.text?.length || 0) + 3,
                0
            )
            if (this.bytesUsed + contextLen > this.byteLimit) {
                ignored.push(contextItem)
                limitReached = true
                continue
            }
            this.seenContext.add(id)
            this.reverseMessages.push(...contextMessages)
            this.bytesUsed += contextLen
            used.push(contextItem)
        }
        return {
            limitReached,
            used,
            ignored,
            duplicate,
        }
    }
}

const editorRegexps = [/editor/, /(open|current|this|entire)\s+file/, /current(ly)?\s+open/, /have\s+open/]

function isEditorContextRequired(input: string): boolean {
    const inputLowerCase = input.toLowerCase()
    // If the input matches any of the `editorRegexps` we assume that we have to include
    // the editor context (e.g., currently open file) to the overall message context.
    for (const regexp of editorRegexps) {
        if (inputLowerCase.match(regexp)) {
            return true
        }
    }
    return false
}
