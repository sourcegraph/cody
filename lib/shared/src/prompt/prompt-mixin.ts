import type { ChatMessage } from '../chat/transcript/messages'
import { PromptString, ps } from './prompt-string'

/**
 * The preamble we add to the start of the last human open-end chat message that has context items.
 */
const CONTEXT_PREAMBLE = ps`You have access to the provided codebase context. `
/**
 * The preamble for preventing known models from hedging.
 */
const HEDGES_PREVENTION = ps`Answer positively without apologizing. `

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple commands.
 */
export class PromptMixin {
    private static mixins: PromptMixin[] = []
    private static contextMixin: PromptMixin = new PromptMixin(CONTEXT_PREAMBLE)

    /**
     * Prepends all mixins to `humanMessage`. Modifies and returns `humanMessage`.
     * Add hedging prevention prompt to specific models who need this.
     */
    public static mixInto(humanMessage: ChatMessage, modelID: string): ChatMessage {
        // Default Mixin is added at the end so that it cannot be overriden by other mixins.
        let mixins = PromptString.join(
            [...PromptMixin.mixins, PromptMixin.contextMixin].map(mixin => mixin.prompt),
            ps`\n\n`
        )

        if (modelID.includes('claude-3-5-sonnet')) {
            mixins = mixins.concat(HEDGES_PREVENTION)
        }

        if (mixins) {
            // Stuff the prompt mixins at the start of the human text.
            // Note we do not reflect them in `text`.
            return {
                ...humanMessage,
                text: ps`${mixins}\n\nQuestion: ${humanMessage.text ? humanMessage.text : ''}`,
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
