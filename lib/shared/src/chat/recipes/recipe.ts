import { CodebaseContext } from '../../codebase-context'
import { Editor } from '../../editor'
import { IntentDetector } from '../../intent-detector'
import { BotResponseMultiplexer } from '../bot-response-multiplexer'
import { generatePreambleGetter } from '../preamble'
import { Interaction } from '../transcript/interaction'

/**
 * Recipes should produce slightly different outputs depending on their goal.
 * It is important that this is distinguished so we can optimize our prompt.
 *
 * Examples:
 * - `edit`: Cody is inserting code directly into the editor.
 * - `explain`: Cody is producing a text output into a chat window.
 */
type RecipeContextGoal = 'explain' | 'edit'

/** Tools and context recipes can use at the point they are invoked. */
export interface RecipeContext {
    goal: RecipeContextGoal
    editor: Editor
    intentDetector: IntentDetector
    codebaseContext: CodebaseContext
    responseMultiplexer: BotResponseMultiplexer
    firstInteraction: boolean
}

export type RecipeID =
    | 'chat-question'
    | 'context-search'
    | 'explain-code-detailed'
    | 'explain-code-high-level'
    | 'inline-touch'
    | 'find-code-smells'
    | 'fixup'
    | 'generate-docstring'
    | 'generate-unit-test'
    | 'git-history'
    | 'improve-variable-names'
    | 'inline-chat'
    | 'my-prompt'
    | 'next-questions'
    | 'non-stop'
    | 'pr-description'
    | 'release-notes'
    | 'translate-to-language'

export abstract class Recipe {
    constructor(public getPreamble: ReturnType<typeof generatePreambleGetter>) {}
    public abstract id: RecipeID
    public abstract getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null>
}
