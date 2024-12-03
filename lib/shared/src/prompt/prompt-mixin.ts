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
const DEEP_CODY = ps`Explain your reasoning in detail for coding questions. `

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

        // Handle Deep Cody specific prompts
        const isDeepCodyEnabled = modelID?.includes('deep-cody')
        if (isDeepCodyEnabled && !newMixins.length) {
            mixins.push(new PromptMixin(HEDGES_PREVENTION.concat(DEEP_CODY)))
        }

        // Add new mixins to the list of mixins to be prepended to the next human message.
        mixins.push(...newMixins)

        const prompt = PromptMixin.buildPrompt(mixins)
        return PromptMixin.mixedMessage(humanMessage, prompt, mixins, isDeepCodyEnabled)
    }

    private static buildPrompt(mixins: PromptMixin[]): PromptString {
        // Construct the prompt by joining all the mixins.
        return PromptString.join(
            mixins.map(m => m.prompt),
            ps`\n\n`
        ).trim()
    }

    private static mixedMessage(
        humanMessage: ChatMessage,
        prompt: PromptString,
        mixins: PromptMixin[],
        isDeepCodyEnabled = false
    ): ChatMessage {
        if (!mixins.length || !humanMessage.text) {
            return humanMessage
        }

        if (isDeepCodyEnabled) {
            return {
                ...humanMessage,
                text: ps`${prompt}\n\n[QUESTION]\n`.concat(humanMessage.text),
            }
        }

        // Stuff the prompt mixins at the start of the human text.
        // Note we do not reflect them in ChatMessage `text`.
        return {
            ...humanMessage,
            text: ps`${prompt}\n\nQuestion: ${humanMessage.text ?? ps``}`,
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
