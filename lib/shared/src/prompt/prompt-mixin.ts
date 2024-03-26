import type { ChatMessage } from '../chat/transcript/messages'

// Avoid responses that start with "Unfortunately..." when context is provided.
const rule = 'Answer in high-level using shared context. If more context needed, tell me at the end.'

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple commands.
 */
export class PromptMixin {
    private static mixins: PromptMixin[] = []
    private static defaultMixin: PromptMixin = new PromptMixin(rule)

    /**
     * Add custom prompt mixin to prepend to all human messages.
     */
    public static addMixin(prompt: string): void {
        if (prompt) {
            PromptMixin.mixins.push(new PromptMixin(prompt))
        }
    }

    /**
     * Prepends all mixins to `humanMessage`. Modifies and returns `humanMessage`.
     */
    public static mixInto(humanMessage: ChatMessage): ChatMessage {
        // The default mixin is added at the end so that it cannot be overriden by a custom mixins.
        const mixins = [...PromptMixin.mixins, PromptMixin.defaultMixin].map(m => m.prompt).join(' ')
        if (mixins) {
            // Stuff the prompt mixins at the start of the human text.
            // NOTE: we do not reflect mixins in `displayText`.
            return { ...humanMessage, text: `${mixins} ${humanMessage.text}` }
        }
        return humanMessage
    }

    /**
     * Creates a mixin with the given, fixed prompt to insert.
     */
    constructor(private readonly prompt: string) {}
}
