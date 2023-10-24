import { InteractionMessage } from '../chat/transcript/messages'

const identity = 'Reply as Cody, a coding assistant developed by Sourcegraph.'
const hallucinate = 'Never make any assumptions nor provide any misleading or hypothetical examples.'

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple recipes.
 */
export class PromptMixin {
    private static mixins: PromptMixin[] = []
    private static customMixin: PromptMixin[] = []
    // The default prompt mixin that instructs Cody to identify itself and avoid hallucinations.
    private static defaultMixin: PromptMixin = new PromptMixin(`(${identity} ${hallucinate})`)

    /**
     * Adds a prompt mixin to the global set.
     */
    public static add(mixin: PromptMixin): void {
        this.mixins.push(mixin)
    }

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
        // Default Maxin is added at the end so that it cannot be overriden by a custom mixin.
        const mixins = [...this.mixins, ...this.customMixin, this.defaultMixin].map(mixin => mixin.prompt).join('\n\n')
        if (mixins) {
            // Stuff the prompt mixins at the start of the human text.
            // Note we do not reflect them in displayText.
            return { ...humanMessage, text: `${mixins}\n\n${humanMessage.text}` }
        }
        return humanMessage
    }

    /**
     * Creates a mixin with the given, fixed prompt to insert.
     */
    constructor(private readonly prompt: string) {}
}

/**
 * Creates a prompt mixin to get Cody to reply in the given language, for example "en-AU" for "Australian English".
 * End with a new statement to redirect Cody to the next prompt. This prevents Cody from responding to the language prompt.
 */
export function languagePromptMixin(languageCode: string): PromptMixin {
    const languagePrompt = `Reply in the language with RFC5646/ISO language code "${languageCode}".`
    return new PromptMixin(languageCode ? languagePrompt : '')
}

export function newPromptMixin(text: string): PromptMixin {
    return new PromptMixin(text)
}
