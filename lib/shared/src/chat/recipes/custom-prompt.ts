import { CodebaseContext } from '../../codebase-context'
import { ContextMessage } from '../../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../../editor'
import { MAX_HUMAN_INPUT_TOKENS, NUM_CODE_RESULTS, NUM_TEXT_RESULTS } from '../../prompt/constants'
import { truncateText } from '../../prompt/truncation'
import { CodyPromptContext, defaultCodyPromptContext } from '../prompts'
import { prompts } from '../prompts/templates'
import {
    isOnlySelectionRequired,
    newInteraction,
    newInteractionWithError,
    promptTextWithCodeSelection,
} from '../prompts/utils'
import {
    getCurrentDirContext,
    getCurrentFileContextFromEditorSelection,
    getEditorDirContext,
    getEditorOpenTabsContext,
    getEditorSelectionContext,
    getFilePathContext,
    getHumanDisplayTextWithFileName,
    getPackageJsonContext,
    getTerminalOutputContext,
} from '../prompts/vscode-context'
import { Interaction } from '../transcript/interaction'

import { getFileExtension, getNormalizedLanguageName, numResults } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

/** ======================================================
 * Recipe for running custom prompts from the cody.json files
 * Works with VS Code only
====================================================== **/
export class CustomPrompt implements Recipe {
    public id: RecipeID = 'custom-prompt'
    public title = 'Custom Prompt'

    /**
     * Retrieves an Interaction object based on the humanChatInput and RecipeContext provided.
     * The Interaction object contains messages from both the human and the assistant, as well as context information.
     *
     * @param humanChatInput - The input from the human user.
     * @param context - The RecipeContext object containing information about the editor, intent detector, codebase context, response multiplexer, and whether this is the first interaction.
     * @returns A Promise that resolves to an Interaction object.
     */
    public async getInteraction(humanChatInput: string, context: RecipeContext): Promise<Interaction | null> {
        // Check if context is required
        const contextConfig = await context.editor.controllers?.command?.get('context')
        const isContextNeeded = contextConfig
            ? (JSON.parse(contextConfig) as CodyPromptContext)
            : defaultCodyPromptContext

        // Get prompt text from the editor command or from the human input
        const promptText = humanChatInput.trim() || (await context.editor.controllers?.command?.get()) || null
        if (!promptText) {
            const errorMessage = 'Please enter a valid prompt for the custom command.'
            return newInteractionWithError(errorMessage, promptText || '')
        }
        const promptName = (await context.editor.controllers?.command?.get('current')) || promptText
        const slashCommand = (await context.editor.controllers?.command?.get('slash')) || promptName

        // Check if selection is required. If selection is not defined, accept visible content
        const selectionContent = isContextNeeded?.selection
            ? context.editor.getActiveTextEditorSelection()
            : context.editor.getActiveTextEditorSelectionOrVisibleContent()

        const selection = selectionContent
        if (isContextNeeded?.selection && !selection?.selectedText) {
            const errorMessage = `__${slashCommand}__ requires highlighted code. Please select some code in your editor and try again.`
            return newInteractionWithError(errorMessage, slashCommand)
        }

        // Add selection file name as display when available
        const displayText = selection?.fileName
            ? getHumanDisplayTextWithFileName(slashCommand, selection, context.editor.getWorkspaceRootUri())
            : slashCommand
        const languageName = selection?.fileName ? getNormalizedLanguageName(getFileExtension(selection?.fileName)) : ''
        // Prompt text to share with Cody but not display to human
        const codyPromptText = prompts.instruction
            .replace('{humanInput}', promptText)
            .replaceAll('{languageName}', languageName)

        // Attach code selection to prompt text if only selection is needed as context
        if (selection && isOnlySelectionRequired(isContextNeeded)) {
            const truncatedTextWithCode = promptTextWithCodeSelection(codyPromptText, selection)
            if (truncatedTextWithCode) {
                return newInteraction({ text: truncatedTextWithCode, displayText })
            }
        }

        // Get output from the command if any
        const commandOutput = await context.editor.controllers?.command?.get('output')

        const truncatedText = truncateText(codyPromptText, MAX_HUMAN_INPUT_TOKENS)
        const contextMessages = this.getContextMessages(
            truncatedText,
            context.editor,
            context.codebaseContext,
            isContextNeeded,
            selection,
            commandOutput
        )
        return newInteraction({ text: truncatedText, displayText, contextMessages })
    }

    private async getContextMessages(
        text: string,
        editor: Editor,
        codebaseContext: CodebaseContext,
        isContextRequired: CodyPromptContext,
        selection?: ActiveTextEditorSelection | null,
        commandOutput?: string | null
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []

        // none
        if (isContextRequired.none) {
            return []
        }

        // codebase
        if (isContextRequired.codebase) {
            const codebaseContextMessages = await codebaseContext.getContextMessages(text, numResults)
            contextMessages.push(...codebaseContextMessages)
        }

        // Open files in editor tabs
        if (isContextRequired.openTabs) {
            const openTabsContext = await getEditorOpenTabsContext()
            contextMessages.push(...openTabsContext)
        }

        // Current directory
        if (isContextRequired.currentDir) {
            const isTestRequest = text.includes('test')
            const currentDirContext = await getCurrentDirContext(isTestRequest)
            const packageJSONContext = await getPackageJsonContext(selection?.fileName)
            contextMessages.push(...currentDirContext, ...(isTestRequest ? packageJSONContext : []))
        }

        // Files from a directory path
        if (isContextRequired.directoryPath?.length) {
            const fileContext = await getEditorDirContext(isContextRequired.directoryPath, selection?.fileName)
            contextMessages.push(...fileContext)
        }

        // File path
        const fileContextQueue = []
        if (isContextRequired.filePath?.length) {
            const fileContext = await getFilePathContext(isContextRequired.filePath)
            fileContextQueue.push(...fileContext)
        }

        // Currently focused file in editor
        const currentFileContextStack = []
        // If currentFile is true, or when selection is true but there is no selected text
        // then we want to include the current file context
        if (selection && (isContextRequired.currentFile || (isContextRequired.selection && !selection?.selectedText))) {
            const contextMsg = getCurrentFileContextFromEditorSelection(selection)
            currentFileContextStack.push(...contextMsg)
        }

        contextMessages.push(...fileContextQueue, ...currentFileContextStack)

        // Selected text - this is exclude only if selection is set to false specifically
        if (isContextRequired.selection !== false && selection?.selectedText) {
            contextMessages.push(...getEditorSelectionContext(selection))
        }

        // Command output
        if (isContextRequired.command?.length && commandOutput) {
            contextMessages.push(...getTerminalOutputContext(commandOutput))
        }

        const maxResults = Math.floor((NUM_CODE_RESULTS + NUM_TEXT_RESULTS) / 2) * 2
        return contextMessages.slice(-maxResults * 2)
    }
}
