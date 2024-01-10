import * as vscode from 'vscode'

import { isCodyIgnoredFile } from '@sourcegraph/cody-shared/src/chat/context-filter'
import { getSimplePreamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { type CodyCommand, type CodyCommandContext } from '@sourcegraph/cody-shared/src/commands'
import {
    isMarkdownFile,
    populateCodeContextTemplate,
    populateContextTemplateFromText,
    populateCurrentSelectedCodeContextTemplate,
    populateMarkdownContextTemplate,
} from '@sourcegraph/cody-shared/src/prompt/templates'
import { type Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { logDebug } from '../../log'

import { contextItemId, type ContextItem, type MessageWithContext, type SimpleChatModel } from './SimpleChatModel'

export interface IContextProvider {
    // Context explicitly specified by user
    getExplicitContext(): ContextItem[]

    // Relevant context pulled from the editor state and broader repository
    getEnhancedContext(query: string): Promise<ContextItem[]>

    getCommandContext(promptText: string, contextConfig: CodyCommandContext): Promise<ContextItem[]>
}

export interface IPrompter {
    makePrompt(
        chat: SimpleChatModel,
        contextProvider: IContextProvider,
        useEnhancedContext: boolean,
        byteLimit: number,
        command?: CodyCommand
    ): Promise<{
        prompt: Message[]
        contextLimitWarnings: string[]
        newContextUsed: ContextItem[]
    }>
}

export class DefaultPrompter implements IPrompter {
    // Constructs the raw prompt to send to the LLM, with message order reversed, so we can construct
    // an array with the most important messages (which appear most important first in the reverse-prompt.
    //
    // Returns the reverse prompt, a list of warnings that indicate that the prompt was truncated, and
    // the new context that was used in the prompt for the current message.
    public async makePrompt(
        chat: SimpleChatModel,
        contextProvider: IContextProvider,
        useEnhancedContext: boolean,
        byteLimit: number,
        command?: CodyCommand
    ): Promise<{
        prompt: Message[]
        contextLimitWarnings: string[]
        newContextUsed: ContextItem[]
    }> {
        const promptBuilder = new PromptBuilder(byteLimit)
        const newContextUsed: ContextItem[] = []
        const warnings: string[] = []
        const preInstruction: string | undefined = vscode.workspace.getConfiguration('cody.chat').get('preInstruction')

        const preambleMessages = getSimplePreamble(preInstruction)
        const preambleSucceeded = promptBuilder.tryAddToPrefix(preambleMessages)
        if (!preambleSucceeded) {
            throw new Error(`Preamble length exceeded context window size ${byteLimit}`)
        }

        // Add existing transcript messages
        const reverseTranscript: MessageWithContext[] = [...chat.getMessagesWithContext()].reverse()
        for (let i = 0; i < reverseTranscript.length; i++) {
            const messageWithContext = reverseTranscript[i]
            const contextLimitReached = promptBuilder.tryAdd(messageWithContext.message)
            if (!contextLimitReached) {
                warnings.push(`Ignored ${reverseTranscript.length - i} transcript messages due to context limit`)
                return {
                    prompt: promptBuilder.build(),
                    contextLimitWarnings: warnings,
                    newContextUsed,
                }
            }
        }

        {
            // Add context from new user-specified context items
            const { limitReached, used } = promptBuilder.tryAddContext(
                contextProvider.getExplicitContext(),
                (item: ContextItem) => this.renderContextItem(item)
            )
            newContextUsed.push(...used)
            if (limitReached) {
                warnings.push('Ignored current user-specified context items due to context limit')
                return { prompt: promptBuilder.build(), contextLimitWarnings: warnings, newContextUsed }
            }
        }

        // TODO(beyang): Decide whether context from previous messages is less
        // important than user added context, and if so, reorder this.
        {
            // Add context from previous messages
            const { limitReached } = promptBuilder.tryAddContext(
                reverseTranscript.flatMap((message: MessageWithContext) => message.newContextUsed || []),
                (item: ContextItem) => this.renderContextItem(item)
            )
            if (limitReached) {
                warnings.push('Ignored prior context items due to context limit')
                return { prompt: promptBuilder.build(), contextLimitWarnings: warnings, newContextUsed }
            }
        }

        const lastMessage = reverseTranscript[0]
        if (!lastMessage?.message.text) {
            throw new Error('No last message or last message text was empty')
        }
        if (lastMessage.message.speaker === 'assistant') {
            throw new Error('Last message in prompt needs speaker "human", but was "assistant"')
        }
        if (useEnhancedContext || command) {
            // Add additional context from current editor or broader search
            const additionalContextItems = command
                ? await contextProvider.getCommandContext(command.prompt, command.context || { codebase: false })
                : await contextProvider.getEnhancedContext(lastMessage.message.text)
            const { limitReached, used, ignored } = promptBuilder.tryAddContext(
                additionalContextItems,
                (item: ContextItem) => this.renderContextItem(item)
            )
            newContextUsed.push(...used)
            if (limitReached) {
                logDebug(
                    'DefaultPrompter.makePrompt',
                    `Ignored ${ignored.length} additional context items due to limit reached`
                )
            }
        }

        return {
            prompt: promptBuilder.build(),
            contextLimitWarnings: warnings,
            newContextUsed,
        }
    }

    private renderContextItem(contextItem: ContextItem): Message[] {
        // Do not create context item for empty file
        if (!contextItem.text?.trim()?.length) {
            return []
        }
        let messageText: string
        if (contextItem.source === 'selection') {
            messageText = populateCurrentSelectedCodeContextTemplate(contextItem.text, contextItem.uri)
        } else if (contextItem.source === 'editor') {
            // This template text works well with prompts in our commands
            // Using populateCodeContextTemplate here will cause confusion to Cody
            const templateText = 'Codebase context from file path {fileName}: '
            messageText = populateContextTemplateFromText(templateText, contextItem.text, contextItem.uri)
        } else if (contextItem.source === 'terminal') {
            messageText = contextItem.text
        } else if (isMarkdownFile(contextItem.uri)) {
            messageText = populateMarkdownContextTemplate(contextItem.text, contextItem.uri)
        } else {
            messageText = populateCodeContextTemplate(contextItem.text, contextItem.uri)
        }
        return [
            { speaker: 'human', text: messageText },
            { speaker: 'assistant', text: 'Ok.' },
        ]
    }
}

/**
 * PromptBuilder constructs a full prompt given a byteLimit constraint.
 * The final prompt is constructed by concatenating the following fields:
 * - prefixMessages
 * - the reverse of reverseMessages
 */
class PromptBuilder {
    private prefixMessages: Message[] = []
    private reverseMessages: Message[] = []
    private bytesUsed = 0
    private seenContext = new Set<string>()
    constructor(private readonly byteLimit: number) {}

    public build(): Message[] {
        return this.prefixMessages.concat([...this.reverseMessages].reverse())
    }

    public tryAddToPrefix(messages: Message[]): boolean {
        let numBytes = 0
        for (const message of messages) {
            numBytes += message.speaker.length + (message.text?.length || 0) + 3 // space and 2 newlines
        }
        if (numBytes + this.bytesUsed > this.byteLimit) {
            return false
        }
        this.prefixMessages.push(...messages)
        this.bytesUsed += numBytes
        return true
    }

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

    /**
     * Tries to add context items to the prompt, tracking bytes used.
     * Returns info about which items were used vs. ignored.
     */
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
            if (contextItem.uri.scheme === 'file' && isCodyIgnoredFile(contextItem.uri)) {
                ignored.push(contextItem)
                continue
            }
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
