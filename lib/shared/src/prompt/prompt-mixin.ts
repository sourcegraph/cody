import type { ChatMessage } from '../chat/transcript/messages'
import { PromptString, ps } from './prompt-string'

const TOOL_PREAMBLE = ps`When answering a question, think step-by-step and provide detailed explanations. If you need more information to answer the question, only response with the following action tags instead of writing template answer or use placeholder to retrieve the required information:
- if you need additional context from the codebase: <CODYTOOLSEARCH><query>$SEARCH_QUERY<query></CODYTOOLSEARCH>
- if you need to see the output of different shell commands: <CODYTOOLCLI><cmd>$SHELL_COMMAND<cmd></CODYTOOLCLI>
- if you need full content from a file: <CODYTOOLFILE><file>$FILEPATH<file></CODYTOOLFILE>
NOTE: only use the above action tags if you need to see the output of different shell commands, full content from a file, or search for context.
If you are replying to a question with a shell command, enclose the command with markdown code block instead.`

/**
 * The preamble we add to the start of the last human open-end chat message that has context items.
 */
const CONTEXT_PREAMBLE = ps`You have access to the provided codebase context. `
/**
 * The preamble for preventing known models from hedging.
 */
const HEDGES_PREVENTION = ps`Answer positively without apologizing. Give step-by-step instruction for how-to questions. `

/**
 * Prompt mixins elaborate every prompt presented to the LLM.
 * Add a prompt mixin to prompt for cross-cutting concerns relevant to multiple commands.
 */
export class PromptMixin {
    private static mixins: PromptMixin[] = []
    private static contextMixin: PromptMixin = new PromptMixin(CONTEXT_PREAMBLE)
    private static tooltMixin: PromptMixin = new PromptMixin(TOOL_PREAMBLE)

    public static toolMixin(humanMessage: ChatMessage): ChatMessage {
        const mixins = PromptString.join(
            [PromptMixin.tooltMixin].map(mixin => mixin.prompt),
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
