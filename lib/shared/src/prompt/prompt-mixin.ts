import type { ChatMessage } from '../chat/transcript/messages'
import type { ChatModel } from '../models/types'
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
 * Answer guidelines for the Deep Cody model.
 */
const AGENTIC_CHAT = ps`Explain your reasoning in detail for coding questions. `

//  Models that do not work well with agentic prompts
const agenticBlockedModels = ['chat-preview']

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple commands.
 */
export class PromptMixin {
    /**
     * A list of default mixins to be prepended to the next human message.
     */
    private static mixins: PromptMixin[] = []
    private static hedging: PromptMixin = new PromptMixin(HEDGES_PREVENTION)

    /**
     * Prepends all mixins to `humanMessage`. Modifies and returns `humanMessage`.
     * Add hedging prevention prompt to specific models who need this.
     */
    public static mixInto(
        humanMessage: ChatMessage,
        modelID: ChatModel | undefined,
        newMixins: PromptMixin[] = []
    ): ChatMessage {
        const mixins = [...PromptMixin.mixins]

        // Handle hedging prevention for specific models
        const apologiticModels = ['3-5-sonnet', '3.5-sonnet']
        if (modelID && apologiticModels.some(model => modelID.includes(model))) {
            mixins.push(PromptMixin.hedging)
        }

        // Handle agent-specific prompts
        if (
            humanMessage.agent === 'deep-cody' &&
            !newMixins.length &&
            !agenticBlockedModels.some(m => modelID?.includes(m))
        ) {
            mixins.push(new PromptMixin(AGENTIC_CHAT))
        }

        // Add new mixins to the list of mixins to be prepended to the next human message.
        mixins.push(...newMixins)
        return PromptMixin.mixedMessage(humanMessage, mixins)
    }

    private static join(mixins: PromptMixin[]): PromptString {
        // Construct the prompt by joining all the mixins.
        return PromptString.join(
            mixins.map(m => m.prompt),
            ps`\n\n`
        ).trim()
    }

    private static mixedMessage(humanMessage: ChatMessage, mixins: PromptMixin[]): ChatMessage {
        if (!humanMessage.text || !mixins.length) {
            return humanMessage
        }

        const joinedMixins = PromptMixin.join(mixins)

        // If the agent's mixins include `{{USER_INPUT_TEXT}}`, replace it with the human message text.
        if (humanMessage.agent && joinedMixins.includes('{{USER_INPUT_TEXT}}')) {
            return {
                ...humanMessage,
                text: joinedMixins.replace('{{USER_INPUT_TEXT}}', humanMessage.text),
            }
        }

        // Stuff the prompt mixins at the start of the human text.
        // Note we do not reflect them in ChatMessage `text`.
        return {
            ...humanMessage,
            text: ps`${joinedMixins}\n\nQuestion: ${humanMessage.text ?? ps``}`,
        }
    }

    public static getContextMixin(): PromptMixin {
        return new PromptMixin(CONTEXT_PREAMBLE)
    }
    /**
     * Add prompt to the list of mixins to be prepended to the next human message.
     * It gets reset each time it is used.
     */
    public static add(mixin: PromptMixin): void {
        PromptMixin.mixins.push(mixin)
    }

    /**
     * Creates a mixin with the given, fixed prompt to insert.
     */
    constructor(private readonly prompt: PromptString) {}
}

export function newPromptMixin(text: PromptString): PromptMixin {
    return new PromptMixin(text)
}
