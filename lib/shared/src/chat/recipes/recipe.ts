import { CodebaseContext } from '../../codebase-context'
import { ContextFile } from '../../codebase-context/messages'
import { Editor } from '../../editor'
import { IntentDetector } from '../../intent-detector'
import { BotResponseMultiplexer } from '../bot-response-multiplexer'
import { Interaction } from '../transcript/interaction'

/** Tools and context recipes can use at the point they are invoked. */
export interface RecipeContext {
    editor: Editor
    intentDetector: IntentDetector
    codebaseContext: CodebaseContext
    responseMultiplexer?: BotResponseMultiplexer
    addEnhancedContext: boolean
    userInputContextFiles?: ContextFile[]
}

// TODO:
// If instead of a union like this we'd make a discriminative union out of all recipes
// we could then make the ID a simple mapping over they keys for those.
// This has as a benefit that if you select a recipe with a specific ID you get them
// typed, so if you have any recipe specific public methods they would now be exposed
// without further type-checking.

// Here's how that would look:

// interface ExampleRecipeA {
//     id: 'recipe-a'
//     a: boolean
// }
// interface ExampleRecipeB {
//     id: 'recipe-b'
//     b: boolean
// }
// type ExampleAllRecipes = ExampleRecipeA | ExampleRecipeB // ...etc

// // Map each case in the original union to the corresponding case in MyUnionWithIDs
// type ExampleAddId<T extends { id: string }> = T & Recipe

// // Apply AddID to each case in the original union
// type ExampleAllRecipesUnique = {
//     [K in ExampleAllRecipes['id']]: ExampleAddId<Extract<ExampleAllRecipes, { type: K }>>
// }
// // Get all possible keys
// type ExampleAllRecipeIds = keyof ExampleAllRecipesUnique
// // Now we have typed access to additional properties
// const unk: ExampleAllRecipes = { id: 'recipe-a', a: false } as any
// if(unk.id === 'recipe-a'){ //knows ids
//     unk.a //exists
// }

export type RecipeID =
    | 'chat-question'
    | 'code-question'
    | 'context-search'
    | 'local-indexed-keyword-search'
    | 'explain-code-detailed'
    | 'explain-code-high-level'
    | 'find-code-smells'
    | 'fixup'
    | 'generate-docstring'
    | 'generate-unit-test'
    | 'git-history'
    | 'improve-variable-names'
    | 'custom-prompt'
    | 'next-questions'
    | 'pr-description'
    | 'commit-message'
    | 'release-notes'
    | 'translate-to-language'

export enum RecipeType {
    Ask = 'ask',
    Edit = 'edit',
}

export interface Recipe {
    id: RecipeID
    title: string // Title Case
    multiplexerTopic?: string
    type?: RecipeType
    stopSequences?: string[]
    getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null>
}
