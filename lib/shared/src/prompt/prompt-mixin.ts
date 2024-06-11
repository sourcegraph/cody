import type { ChatMessage } from '../chat/transcript/messages'
import { PromptString, ps } from './prompt-string'

/**
 * The preamble we add to the start of every human message that has context items.
 */
const CONTEXT_PREAMBLE = ps`The provided codebase context are the code you need and have access to. Do not make any assumptions. Ask for additional context if you need it. Question:`

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple commands.
 */
export class PromptMixin {
    private static mixins: PromptMixin[] = []
    // The prompt that instructs Cody to identify itself and avoid hallucinations.
    private static defaultMixin: PromptMixin = new PromptMixin(CONTEXT_PREAMBLE)

    /**
     * Prepends all mixins to `humanMessage`. Modifies and returns `humanMessage`.
     */
    public static mixInto(humanMessage: ChatMessage): ChatMessage {
        // Default Mixin is added at the end so that it cannot be overriden by other mixins.
        const mixins = PromptString.join(
            [...PromptMixin.mixins, PromptMixin.defaultMixin].map(mixin => mixin.prompt),
            ps`\n\n`
        )
        if (mixins) {
            // Stuff the prompt mixins at the start of the human text.
            // Note we do not reflect them in `text`.
            return {
                ...humanMessage,
                text: ps`${mixins} ${humanMessage.text ? humanMessage.text : ''}`,
            }
        }
        return humanMessage
    }
    /**
     * Creates a mixin with the given, fixed prompt to insert.
     */
    constructor(private readonly prompt: PromptString) {}
}

export function newPromptMixin(text: PromptString): PromptMixin {
    return new PromptMixin(text)
}
