import type { ChatMessage } from '../chat/transcript/messages'
import { PromptString, ps } from './prompt-string'

const identity = ps`Reply as Cody, a coding assistant developed by Sourcegraph.`
const hallucinate = ps`If context is available: never make any assumptions nor provide any misleading or hypothetical examples.`
const CODY_INTRO_PROMPT = ps`(${identity} ${hallucinate}) `

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple commands.
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
    public static setCustom(mixin: PromptMixin): void {
        PromptMixin.customMixin = [mixin]
    }

    /**
     * Prepends all mixins to `humanMessage`. Modifies and returns `humanMessage`.
     */
    public static mixInto(humanMessage: ChatMessage): ChatMessage {
        // Default Mixin is added at the end so that it cannot be overriden by a custom mixin.
        const mixins = PromptString.join(
            [...PromptMixin.mixins, ...PromptMixin.customMixin, PromptMixin.defaultMixin].map(
                mixin => mixin.prompt
            ),
            ps`\n\n`
        )
        if (mixins) {
            // Stuff the prompt mixins at the start of the human text.
            // Note we do not reflect them in `text`.
            return {
                ...humanMessage,
                text: ps`${mixins}${humanMessage.text ? humanMessage.text : ''}`,
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
