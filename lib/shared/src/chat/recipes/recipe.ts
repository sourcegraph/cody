import { CodebaseContext } from '../../codebase-context'
import { Editor } from '../../editor'
import { IntentDetector } from '../../intent-detector'
import { BotResponseMultiplexer } from '../bot-response-multiplexer'
import { Interaction } from '../transcript/interaction'

/** Tools and context recipes can use at the point they are invoked. */
export interface RecipeContext {
    editor: Editor
    intentDetector: IntentDetector
    codebaseContext: CodebaseContext
    responseMultiplexer: BotResponseMultiplexer
    firstInteraction: boolean
}

export type RecipeID =
    | 'chat-question'
    | 'code-question'
    | 'context-search'
    | 'local-indexed-keyword-search'
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
    | 'custom-prompt'
    | 'next-questions'
    | 'pr-description'
    | 'release-notes'
    | 'translate-to-language'

export interface Recipe {
    id: RecipeID
    multiplexerTopic?: string
    getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null>
}
