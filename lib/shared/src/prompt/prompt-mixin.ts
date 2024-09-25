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
 * Answer guidelines for the Cody Reflection model.
 */
const CODY_REFLECTION = ps`Give step-by-step instruction for how-to questions. Keep answer for general questions concise and informative. `

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple commands.
 */
export class PromptMixin {
    /**
     * A list of mixins to be prepended to the next human message.
     * This list gets reset after each use.
     */
    private static mixins: PromptMixin[] = []
    private static hedging: PromptMixin = new PromptMixin(HEDGES_PREVENTION)
    private static reflection: PromptMixin = new PromptMixin(CODY_REFLECTION)

    /**
     * Prepends all mixins to `humanMessage`. Modifies and returns `humanMessage`.
     * Add hedging prevention prompt to specific models who need this.
     */
    public static mixInto(humanMessage: ChatMessage, modelID: ChatModel | undefined): ChatMessage {
        // Default Mixin is added at the end so that it cannot be overriden by other mixins.
        const mixins = [...PromptMixin.mixins]
        // Prevents known models like Claude 3.5 Sonnet from apologizing constantly.
        const apologiticModels = ['3-5-sonnet', '3.5-sonnet', 'cody-reflection']
        if (modelID && apologiticModels.some(model => modelID.includes(model))) {
            mixins.push(PromptMixin.hedging)
        }

        // Add prompt that provides answer guidelines for the Cody Reflection model.
        if (modelID === 'sourcegraph/cody-reflection' && !PromptMixin.mixins.length) {
            mixins.push(PromptMixin.reflection)
        }

        // Construct the prompt by joining all the mixins.
        const prompt = PromptString.join(
            mixins.map(m => m.prompt),
            ps`\n\n`
        ).trim()

        // Reset the prompt mixins after use to avoid mixing into the next message.
        PromptMixin.reset()

        // Stuff the prompt mixins at the start of the human text.
        // Note we do not reflect them in `text`.
        return mixins.length > 0
            ? {
                  ...humanMessage,
                  text: ps`${prompt}\n\nQuestion: ${humanMessage.text ?? ps``}`,
              }
            : humanMessage
    }

    public static addContextMixin(): void {
        PromptMixin.mixins.push(new PromptMixin(CONTEXT_PREAMBLE))
    }
    /**
     * Add prompt to the list of mixins to be prepended to the next human message.
     * It gets reset each time it is used.
     */
    public static add(mixin: PromptMixin): void {
        PromptMixin.mixins.push(mixin)
    }

    private static reset(): void {
        PromptMixin.mixins = []
    }

    /**
     * Creates a mixin with the given, fixed prompt to insert.
     */
    constructor(private readonly prompt: PromptString) {}
}

export function newPromptMixin(text: PromptString): PromptMixin {
    return new PromptMixin(text)
}
