import { type InteractionMessage } from '../chat/transcript/messages'

const identity = 'Reply as Cody, a coding assistant developed by Sourcegraph.'
const hallucinate =
    'If context is available: never make any assumptions nor provide any misleading or hypothetical examples.'
export const CODY_INTRO_PROMPT = `(${identity} ${hallucinate}) `

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple recipes.
 */
export class PromptMixin {
    private static mixins: PromptMixin[] = []
    private static customMixin: PromptMixin[] = []
    // The prompt that instructs Cody to identify itself and avoid hallucinations.
    private static defaultMixin: PromptMixin = new PromptMixin(CODY_INTRO_PROMPT)

    /**
     * Adds a custom prompt mixin but not to the global set to make sure it will not be added twice
     * and any new change could replace the old one.
     */
    public static addCustom(mixin: PromptMixin): void {
        this.customMixin = [mixin]
    }

    /**
     * Prepends all mixins to `humanMessage`. Modifies and returns `humanMessage`.
     */
    public static mixInto(humanMessage: InteractionMessage): InteractionMessage {
        // Default Mixin is added at the end so that it cannot be overriden by a custom mixin.
        const mixins = [...this.mixins, ...this.customMixin, this.defaultMixin].map(mixin => mixin.prompt).join('\n\n')
        if (mixins) {
            // Stuff the prompt mixins at the start of the human text.
            // Note we do not reflect them in displayText.
            return { ...humanMessage, text: `${mixins}${humanMessage.text}` }
        }
        return humanMessage
    }

    /**
     * Creates a mixin with the given, fixed prompt to insert.
     */
    constructor(private readonly prompt: string) {}
}

export function newPromptMixin(text: string): PromptMixin {
    return new PromptMixin(text)
}
