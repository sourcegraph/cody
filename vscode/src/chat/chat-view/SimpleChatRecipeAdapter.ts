import { ChatError, ContextFile } from '@sourcegraph/cody-shared'
import { getSimplePreamble } from '@sourcegraph/cody-shared/src/chat/preamble'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { Interaction } from '@sourcegraph/cody-shared/src/chat/transcript/interaction'
import { Editor } from '@sourcegraph/cody-shared/src/editor'
import { IntentDetector } from '@sourcegraph/cody-shared/src/intent-detector'
import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'

import { PlatformContext } from '../../extension.common'
import { ContextProvider } from '../ContextProvider'

import { contextMessageToContextItem } from './chat-helpers'
import { ContextItem, MessageWithContext } from './SimpleChatModel'

/**
 * SimpleChatRecipeAdapter is a class that adapts the old recipes for use by the new
 * SimpleChatPanelProvider
 */
export class SimpleChatRecipeAdapter {
    constructor(
        private editor: Editor,
        private intentDetector: IntentDetector,
        private contextProvider: ContextProvider,
        private platform: Pick<PlatformContext, 'recipes'>
    ) {}

    public async computeRecipeMessages(
        requestID: string,
        recipeID: RecipeID,
        humanChatInput: string,
        userInputContextFiles?: ContextFile[],
        addEnhancedContext: boolean = true
    ): Promise<{
        humanMessage: MessageWithContext
        prompt: Message[]
        error?: string | ChatError
    } | null> {
        const recipe = this.platform.recipes.find(recipe => recipe.id === recipeID)
        if (!recipe) {
            throw new Error(`command ${recipeID} is unsupported`)
        }

        let recipeInput = humanChatInput
        if (recipeID === 'custom-prompt') {
            const commandRunnerID = this.editor.controllers?.command?.getCommand(humanChatInput)
            if (!commandRunnerID) {
                const newCommandRunnerID = await this.editor.controllers?.command?.addCommand(
                    humanChatInput,
                    requestID,
                    userInputContextFiles,
                    addEnhancedContext
                )
                if (newCommandRunnerID === 'invalid') {
                    throw new Error(`did not find valid command from user input "${humanChatInput}"`)
                }
                if (newCommandRunnerID) {
                    recipeInput = newCommandRunnerID
                }
            }
        }

        const interaction = await recipe.getInteraction(recipeInput, {
            editor: this.editor,
            intentDetector: this.intentDetector,
            codebaseContext: this.contextProvider.context,
            addEnhancedContext,
            userInputContextFiles,
        })
        if (!interaction) {
            return null
        }

        const { humanMessage, prompt } = await interactionToHumanMessageAndPrompt(interaction)
        const preambleMessages = getSimplePreamble()
        return {
            humanMessage,
            prompt: preambleMessages.concat(prompt),
            error: interaction?.getAssistantMessage()?.error,
        }
    }
}

/**
 * Converts a legacy Interaction instance into a corresponding humanMessage and prompt.
 * The humanMessage is what is stored in the new chat model, while the prompt is what
 * is sent to the LLM.
 *
 * Note that the fact that this function does not return any assistant message means
 * that any assistant message prefixes defined by the recipe are ignored.
 */
async function interactionToHumanMessageAndPrompt(interaction: Interaction): Promise<{
    humanMessage: MessageWithContext
    prompt: Message[]
}> {
    const humanInteractionMessage = interaction.getHumanMessage()
    const fullContext = await interaction.getFullContext()
    const prompt: Message[] = fullContext.concat([humanInteractionMessage] as Message[])

    const contextItems = fullContext
        .map(m => contextMessageToContextItem(m))
        .filter((m): m is ContextItem => m !== null)
    const displayText = humanInteractionMessage.prefix
        ? humanInteractionMessage.prefix + (humanInteractionMessage.displayText || '')
        : humanInteractionMessage.displayText
    return {
        humanMessage: {
            message: {
                speaker: humanInteractionMessage.speaker,
                text: humanInteractionMessage.text,
            },
            displayText,
            newContextUsed: contextItems,
        },
        prompt,
    }
}
