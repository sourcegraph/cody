import { MAX_RECIPE_INPUT_TOKENS, MAX_RECIPE_SURROUNDING_TOKENS } from '../../prompt/constants'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { type Interaction } from '../transcript/interaction'

import {
    getContextMessagesFromSelection,
    getFileExtension,
    getNormalizedLanguageName,
    MARKDOWN_FORMAT_PROMPT,
    newInteraction,
} from './helpers'
import { type Recipe, type RecipeContext, type RecipeID } from './recipe'

export class GenerateTest implements Recipe {
    public id: RecipeID = 'generate-unit-test'
    public title = 'Generate Unit Test'

    public async getInteraction(_humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        const source = this.id
        const selection = context.editor.getActiveTextEditorSelectionOrEntireFile()
        if (!selection) {
            await context.editor.showWarningMessage('No code selected. Please select some code and try again.')
            return Promise.resolve(null)
        }

        const truncatedSelectedText = truncateText(selection.selectedText, MAX_RECIPE_INPUT_TOKENS)
        const truncatedPrecedingText = truncateTextStart(selection.precedingText, MAX_RECIPE_SURROUNDING_TOKENS)
        const truncatedFollowingText = truncateText(selection.followingText, MAX_RECIPE_SURROUNDING_TOKENS)
        const extension = getFileExtension(selection.fileUri)

        const languageName = getNormalizedLanguageName(extension)
        const promptMessage = `Generate a unit test in ${languageName} for the following code:\n\`\`\`${extension}\n${truncatedSelectedText}\n\`\`\`\n${MARKDOWN_FORMAT_PROMPT}`
        const assistantResponsePrefix = `Here is the generated unit test:\n\`\`\`${extension}\n`

        const displayText = `Generate a unit test for the following code:\n\`\`\`${extension}\n${selection.selectedText}\n\`\`\``

        return newInteraction({
            text: promptMessage,
            displayText,
            source,
            assistantPrefix: assistantResponsePrefix,
            assistantText: assistantResponsePrefix,
            contextMessages: getContextMessagesFromSelection(
                truncatedSelectedText,
                truncatedPrecedingText,
                truncatedFollowingText,
                selection,
                context.codebaseContext
            ),
        })
    }
}
