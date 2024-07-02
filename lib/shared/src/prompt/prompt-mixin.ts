import type { ChatMessage } from '../chat/transcript/messages'
import { FeatureFlag, featureFlagProvider } from '../experimentation/FeatureFlagProvider'
import { PromptString, ps } from './prompt-string'

/**
 * The preamble we add to the start of the last human open-end chat message that has context items.
 */
const CONTEXT_PREAMBLE = ps`You have access to the provided codebase context. `
/**
 * The preamble for preventing known models from hedging.
 */
const HEDGES_PREVENTION = ps`Always provide a high-level overview answer positively without apologizing.`

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple commands.
 */
export class PromptMixin {
    private static mixins: PromptMixin[] = []
    private static defaultMixin: PromptMixin = new PromptMixin(ps``)

    /**
     * Prepends all mixins to `humanMessage`. Modifies and returns `humanMessage`.
     * Add hedging prevention prompt to specific models who need this.
     */
    public static mixInto(humanMessage: ChatMessage, modelID: string): ChatMessage {
        // Default Mixin is added at the end so that it cannot be overriden by other mixins.
        const mixins = PromptString.join(
            [...PromptMixin.mixins, PromptMixin.defaultMixin].map(mixin => mixin.prompt),
            ps`\n\n`
        )

        if (modelID?.includes('claude-3-5-sonnet')) {
            mixins.concat(HEDGES_PREVENTION)
        }

        if (mixins) {
            // Stuff the prompt mixins at the start of the human text.
            // Note we do not reflect them in `text`.
            return {
                ...humanMessage,
                text: ps`${mixins}Question: ${humanMessage.text ? humanMessage.text : ''}`,
            }
        }
        return humanMessage
    }

    /**
     * Sets the default prompt mixin determined by evaluating the CodyChatContextPreamble feature flag.
     * Always enable the context preamble in testing and development mode.
     *
     * If the feature flag is enabled, set the context preamble as the default mixin.
     * If the feature flag is disabled or an error occurs, the default mixin will be an empty prompt.
     */
    public static async updateContextPreamble(isExtensionModeDevOrTest = false): Promise<void> {
        try {
            const enabled =
                isExtensionModeDevOrTest ||
                (await featureFlagProvider.evaluateFeatureFlag(FeatureFlag.CodyChatContextPreamble))
            PromptMixin.defaultMixin = new PromptMixin(enabled ? CONTEXT_PREAMBLE : ps``)
        } catch {
            PromptMixin.resetDefaultPromptMixin()
        }
    }

    private static resetDefaultPromptMixin(): void {
        PromptMixin.defaultMixin = new PromptMixin(ps``)
    }

    /**
     * Creates a mixin with the given, fixed prompt to insert.
     */
    constructor(private readonly prompt: PromptString) {}
}

export function newPromptMixin(text: PromptString): PromptMixin {
    return new PromptMixin(text)
}
