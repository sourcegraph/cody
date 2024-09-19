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
 * Answering guidelines for the Cody Reflection model.
 */
const DEEP_CODY = ps`Give step-by-step instruction for how-to questions. Keep answer for general questions concise and informative.`
/**
 * Prompt that provides instructions for reflecting on the context.
 */
const CONTEXT_REVIEW = ps`Analyze the provided context and then think step-by-step about whether you can answer the question using the available information.
If you need more information to answer the question, respond with the following action tags to retrieve the required information:
- if you need additional context from the codebase: <CODYTOOLSEARCH><query>$SEARCH_QUERY<query></CODYTOOLSEARCH>
- if you need to see the output of different shell commands: <CODYTOOLCLI><cmd>$SHELL_COMMAND<cmd></CODYTOOLCLI>
- if you need full content from a file: <CODYTOOLFILE><file>$FILEPATH<file></CODYTOOLFILE>
EXAMPLE: '<CODYTOOLCLI><cmd>gh issue view 1234<cmd></CODYTOOLCLI>' to run the github cli command for getting details for issue #1234.
NOTE: only use the above action tags if you need to see the output of different shell commands, full content from a file, or search for context. You can ask for multiple pieces of information in a single response.
If you are replying to a question with a shell command, enclose the command with markdown code block instead.
If you do not require additional context to answer the question, only reply with a single word "Reviewed".`

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple commands.
 */
export class PromptMixin {
    private static mixins: PromptMixin[] = []
    private static contextMixin: PromptMixin = new PromptMixin(CONTEXT_PREAMBLE)
    private static reflectMixin: PromptMixin = new PromptMixin(CONTEXT_REVIEW)

    public static reflect(humanMessage: ChatMessage, isReflecting = false): ChatMessage {
        const prompt = isReflecting ? PromptMixin.reflectMixin : new PromptMixin(DEEP_CODY)
        const mixins = PromptString.join(
            [prompt].map(m => m.prompt),
            ps`\n\n`
        )
        return {
            ...humanMessage,
            text: ps`${mixins}\n\nQuestion: ${humanMessage.text ? humanMessage.text : ''}`,
        }
    }

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

        // Add prompt that prevents Claude 3.5 Sonnet from apologizing constantly.
        if (modelID.includes('3-5-sonnet') || modelID.includes('3.5-sonnet')) {
            mixins = mixins.concat(HEDGES_PREVENTION)
        }

        if (modelID === 'sourcegraph/cody-reflection') {
            mixins = mixins.concat(HEDGES_PREVENTION).concat(DEEP_CODY)
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
