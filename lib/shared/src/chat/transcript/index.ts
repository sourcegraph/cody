import { type ContextFile, type ContextMessage, type PreciseContext } from '../../codebase-context/messages'
import { CHARS_PER_TOKEN, MAX_AVAILABLE_PROMPT_LENGTH } from '../../prompt/constants'
import { PromptMixin } from '../../prompt/prompt-mixin'
import { type Message } from '../../sourcegraph-api'

import { type Interaction, type InteractionJSON } from './interaction'
import { errorToChatError, type ChatMessage } from './messages'

interface TranscriptJSONScope {
    includeInferredRepository: boolean
    includeInferredFile: boolean
    repositories: string[]
}

export interface TranscriptJSON {
    // This is the timestamp of the first interaction.
    id: string
    chatModel?: string
    chatTitle?: string
    interactions: InteractionJSON[]
    lastInteractionTimestamp: string
    scope?: TranscriptJSONScope
}

/**
 * The "model" class that tracks the call and response of the Cody chat box.
 * Any "controller" logic belongs outside of this class.
 */
export class Transcript {
    private interactions: Interaction[] = []

    public chatModel: string | undefined = undefined

    public chatTitle: string | undefined = undefined

    constructor(interactions: Interaction[] = [], chatModel?: string, title?: string) {
        this.interactions = interactions
        this.chatModel = chatModel
        this.chatTitle = title || this.getLastInteraction()?.getHumanMessage()?.displayText
    }

    public get isEmpty(): boolean {
        return this.interactions.length === 0
    }

    public addInteraction(interaction: Interaction | null): void {
        if (!interaction) {
            return
        }
        this.interactions.push(interaction)
    }

    public getLastInteraction(): Interaction | null {
        return this.interactions.length > 0 ? this.interactions.at(-1)! : null
    }

    public addAssistantResponse(text: string, displayText?: string): void {
        this.getLastInteraction()?.setAssistantMessage({
            speaker: 'assistant',
            text,
            displayText,
        })
    }

    /**
     * Adds an error div to the assistant response. If the assistant has collected
     * some response before, we will add the error message after it.
     * @param error The error to be displayed.
     */
    public addErrorAsAssistantResponse(error: Error): void {
        const lastInteraction = this.getLastInteraction()
        if (!lastInteraction) {
            return
        }

        lastInteraction.setAssistantMessage({
            ...lastInteraction.getAssistantMessage(),
            text: 'Failed to generate a response due to server error.',
            // Serializing normal errors will lose name/message so
            // just read them off manually and attach the rest of the fields.
            error: errorToChatError(error),
        })
    }

    public async getPromptForLastInteraction(
        preamble: Message[] = [],
        maxPromptLength: number = MAX_AVAILABLE_PROMPT_LENGTH,
        onlyHumanMessages: boolean = false
    ): Promise<{ prompt: Message[]; contextFiles: ContextFile[]; preciseContexts: PreciseContext[] }> {
        if (this.interactions.length === 0) {
            return { prompt: [], contextFiles: [], preciseContexts: [] }
        }

        const messages: Message[] = []
        for (let index = 0; index < this.interactions.length; index++) {
            const interaction = this.interactions[index]
            const humanMessage = PromptMixin.mixInto(interaction.getHumanMessage())
            const assistantMessage = interaction.getAssistantMessage()
            const contextMessages = await interaction.getFullContext()
            if (index === this.interactions.length - 1 && !onlyHumanMessages) {
                messages.push(...contextMessages, humanMessage, assistantMessage)
            } else {
                messages.push(humanMessage, assistantMessage)
            }
        }

        const preambleTokensUsage = preamble.reduce((acc, message) => acc + estimateTokensUsage(message), 0)
        let truncatedMessages = truncatePrompt(messages, maxPromptLength - preambleTokensUsage)
        // Return what context fits in the window
        const contextFiles: ContextFile[] = []
        const preciseContexts: PreciseContext[] = []
        for (const msg of truncatedMessages) {
            const contextFile = (msg as ContextMessage).file
            if (contextFile) {
                contextFiles.push(contextFile)
            }

            const preciseContext = (msg as ContextMessage).preciseContext
            if (preciseContext) {
                preciseContexts.push(preciseContext)
            }
        }

        // Filter out extraneous fields from ContextMessage instances
        truncatedMessages = truncatedMessages.map(({ speaker, text }) => ({ speaker, text }))

        return {
            prompt: [...preamble, ...truncatedMessages],
            contextFiles,
            preciseContexts,
        }
    }

    public setUsedContextFilesForLastInteraction(
        contextFiles: ContextFile[],
        preciseContexts: PreciseContext[] = []
    ): void {
        const lastInteraction = this.interactions.at(-1)
        if (!lastInteraction) {
            throw new Error('Cannot set context files for empty transcript')
        }
        lastInteraction.setUsedContext(contextFiles, preciseContexts)
    }

    public toChat(): ChatMessage[] {
        return this.interactions.flatMap(interaction => interaction.toChat())
    }

    public reset(): void {
        this.interactions = []
    }
}

/**
 * Truncates the given prompt messages to fit within the available tokens budget.
 * The truncation is done by removing the oldest pairs of messages first.
 * No individual message will be truncated. We just remove pairs of messages if they exceed the available tokens budget.
 */
function truncatePrompt(messages: Message[], maxTokens: number): Message[] {
    const newPromptMessages = []
    let availablePromptTokensBudget = maxTokens
    for (let i = messages.length - 1; i >= 1; i -= 2) {
        const humanMessage = messages[i - 1]
        const botMessage = messages[i]
        const combinedTokensUsage = estimateTokensUsage(humanMessage) + estimateTokensUsage(botMessage)

        // We stop adding pairs of messages once we exceed the available tokens budget.
        if (combinedTokensUsage <= availablePromptTokensBudget) {
            newPromptMessages.push(botMessage, humanMessage)
            availablePromptTokensBudget -= combinedTokensUsage
        } else {
            break
        }
    }

    // Reverse the prompt messages, so they appear in chat order (older -> newer).
    return newPromptMessages.reverse()
}

/**
 * Gives a rough estimate for the number of tokens used by the message.
 */
function estimateTokensUsage(message: Message): number {
    return Math.round((message.text || '').length / CHARS_PER_TOKEN)
}
