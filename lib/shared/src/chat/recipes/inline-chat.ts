import { CodebaseContext } from '../../codebase-context'
import { ContextMessage } from '../../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../../editor'
import { MAX_HUMAN_INPUT_TOKENS, MAX_RECIPE_INPUT_TOKENS, MAX_RECIPE_SURROUNDING_TOKENS } from '../../prompt/constants'
import { truncateText } from '../../prompt/truncation'
import { Interaction } from '../transcript/interaction'

import { ChatQuestion } from './chat-question'
import { Recipe, RecipeContext, RecipeID } from './recipe'

export class InlineChat implements Recipe {
    public id: RecipeID = 'inline-chat'
    public fast = true

    public async getInteraction(taskId: string, context: RecipeContext): Promise<Interaction | null> {
        const inlineController = context.editor.controllers?.inline
        if (!inlineController) {
            return null
        }

        const inlineTask = await inlineController.getThreadRecipeData(taskId)
        if (!inlineTask) {
            await context.editor.showWarningMessage('Failed to start Inline Chat: empty input or selection.')
            return null
        }

        const truncatedText = truncateText(inlineTask.instruction, MAX_HUMAN_INPUT_TOKENS)
        const MAX_RECIPE_CONTENT_TOKENS = MAX_RECIPE_INPUT_TOKENS + MAX_RECIPE_SURROUNDING_TOKENS * 2
        const truncatedSelectedText = truncateText(inlineTask.selectedText, MAX_RECIPE_CONTENT_TOKENS)

        // Reconstruct Cody's prompt using user's context
        // Replace placeholders in reverse order to avoid collisions if a placeholder occurs in the input
        const promptText = InlineChat.prompt
            .replace('{humanInput}', truncatedText)
            .replace('{selectedText}', truncatedSelectedText)
            .replace('{fileName}', inlineTask.fileName)

        // Text display in UI fpr human that includes the selected code
        const displayText =
            inlineTask.instruction + InlineChat.displayPrompt.replace('{selectedText}', inlineTask.selectedText)

        return Promise.resolve(
            new Interaction(
                {
                    speaker: 'human',
                    text: promptText,
                    displayText,
                },
                { speaker: 'assistant' },
                this.getContextMessages(truncatedText, context.codebaseContext, inlineTask, context.editor),
                []
            )
        )
    }

    // Prompt Templates
    public static readonly prompt = `
    I have questions about this part of the code from {fileName}:
    \`\`\`
    {selectedText}
    \`\`\`

    As my coding assistant, please help me with my questions:
    {humanInput}

    ## Instruction
    - Do not enclose your answer with tags.
    - Do not remove code that might be being used by the other part of the code that was not shared.
    - Your answers and suggestions should based on the provided context only.
    - You may make references to other part of the shared code.
    - Do not suggest code that are not related to any of the shared context.
    - Do not suggest anything that would break the working code.
    `

    // Prompt template for displaying the prompt to users in chat view
    public static readonly displayPrompt = `
    \n\`\`\`\n{selectedText}\n\`\`\`\n`

    // Get context from editor
    private async getContextMessages(
        text: string,
        codebaseContext: CodebaseContext,
        selection: ActiveTextEditorSelection,
        editor: Editor
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        // Add selected text and current file as context
        contextMessages.push(...ChatQuestion.getEditorSelectionContext(selection))
        contextMessages.push(...ChatQuestion.getEditorContext(editor))

        const extraContext = await codebaseContext.getContextMessages(text, {
            numCodeResults: 5,
            numTextResults: 3,
        })
        contextMessages.push(...extraContext)

        return contextMessages
    }
}
