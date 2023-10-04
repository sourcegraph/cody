import { EditorContext } from '../../editor-context'
import { MAX_HUMAN_INPUT_TOKENS } from '../../prompt/constants'
import { truncateText } from '../../prompt/truncation'
import { defaultCodyPromptContext } from '../commands'
import { getHumanLLMText, isOnlySelectionRequired, newInteraction, newInteractionWithError } from '../commands/utils'
import { Interaction } from '../transcript/interaction'

import { Recipe, RecipeContext, RecipeID } from './recipe'

/** ======================================================
 * Recipe for running custom prompts from the cody.json files
 * Works with editorContext only
====================================================== **/
export class CustomPrompt implements Recipe {
    public id: RecipeID = 'custom-prompt'
    public title = 'Custom Prompt'

    /**
     * Retrieves an Interaction object based on the humanChatInput and RecipeContext provided.
     * The Interaction object contains messages from both the human and the assistant, as well as context information.
     */
    public async getInteraction(commandRunnerID: string, context: RecipeContext): Promise<Interaction | null> {
        if (!context.editorContext) {
            console.error('editorContext is required to run this recipe.')
            return null
        }
        const command = context.editor.controllers?.command?.getCommand(commandRunnerID)
        if (!command) {
            const errorMessage = 'Invalid command -- command not found.'
            return newInteractionWithError(errorMessage)
        }

        const contextConfig = command?.context || defaultCodyPromptContext
        // If selection is required, ensure not to accept visible content as selection
        const selection = contextConfig?.selection
            ? await context.editor.getActiveTextEditorSmartSelection()
            : context.editor.getActiveTextEditorSelectionOrVisibleContent()

        // Get prompt text from the editor command or from the human input
        const promptText = command.prompt
        const commandName = command?.slashCommand || command?.description || promptText

        if (!promptText || !commandName) {
            const errorMessage = 'Please enter a valid prompt for the custom command.'
            return newInteractionWithError(errorMessage, promptText || '')
        }

        if (contextConfig?.selection && !selection?.selectedText) {
            const errorMessage = `__${commandName}__ requires highlighted code. Please select some code in your editor and try again.`
            return newInteractionWithError(errorMessage, commandName)
        }

        const commandOutput = command.context?.output

        const text = getHumanLLMText(promptText, selection?.fileName)
        const truncatedText = truncateText(text, MAX_HUMAN_INPUT_TOKENS)

        const editorContext = new EditorContext(
            context.editorContext,
            truncatedText,
            context.editor,
            context.codebaseContext,
            selection,
            commandOutput
        )

        // Add selection file name as display when available
        const displayText = editorContext.getHumanDisplayText(commandName)

        // Attach code selection to prompt text if only selection is needed as context
        if (selection && isOnlySelectionRequired(contextConfig)) {
            const contextMessages = Promise.resolve(editorContext.getCurrentFileContextFromEditorSelection())
            return newInteraction({ text, displayText, contextMessages })
        }

        // Create context messages for the command based on the context configuration
        const contextMessages = editorContext.getContextMessages(contextConfig)

        return newInteraction({ text: truncatedText, displayText, contextMessages })
    }
}
