import { Message } from '../sourcegraph-api'

/**
 * Hooks are functions that are called when Cody performs specific steps or actions.
 */
export interface Hooks {
    preChat?: PreChatHook[]
}

/**
 * A pre-chat hook is a function that is executed to augment (edit, append to, filter, etc.) chat
 * messages before they are sent to the LLM.
 */
export interface PreChatHook {
    /**
     * Called before the chat messages are sent.
     *
     * @param input The input chat messages.
     * @returns The augmented messages.
     */
    run(input: Message[]): Message[]
}
