import { ContextFile } from '@sourcegraph/cody-shared'
import { RecipeID } from '@sourcegraph/cody-shared/src/chat/recipes/recipe'
import { InteractionMessage } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { ContextMessage } from '@sourcegraph/cody-shared/src/codebase-context/messages'
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

        // Note: we don't include any assistant message prefixes defined by recipes
        const humanInteractionMessage: Message = interaction.getHumanMessage()
        const fullContext = await interaction.getFullContext()
        const prompt: Message[] = fullContext.concat([humanInteractionMessage])
        const humanMessage = interactionMessageToMessageWithContext(humanInteractionMessage, fullContext)

        return {
            humanMessage,
            prompt,
        }
    }
}

function interactionMessageToMessageWithContext(
    interactionMessage: InteractionMessage,
    contextMessages: ContextMessage[]
): MessageWithContext {
    const contextItems = contextMessages
        .map(m => contextMessageToContextItem(m))
        .filter((m): m is ContextItem => m !== null)
    const displayText = interactionMessage.prefix
        ? interactionMessage.prefix + (interactionMessage.displayText || '')
        : interactionMessage.displayText
    return {
        message: {
            speaker: interactionMessage.speaker,
            text: interactionMessage.text,
        },
        displayText,
        newContextUsed: contextItems,
    }
}
