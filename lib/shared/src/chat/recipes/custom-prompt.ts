import { CodebaseContext } from '../../codebase-context'
import { ContextMessage } from '../../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../../editor'
import {
    MAX_HUMAN_INPUT_TOKENS,
    MAX_RECIPE_INPUT_TOKENS,
    MAX_RECIPE_SURROUNDING_TOKENS,
    NUM_CODE_RESULTS,
    NUM_TEXT_RESULTS,
} from '../../prompt/constants'
import { truncateText, truncateTextStart } from '../../prompt/truncation'
import { CodyPromptContext, defaultCodyPromptContext } from '../prompts'
import { prompts, rules } from '../prompts/templates'
import {
    interactionWithAssistantError,
    isOnlySelectionRequired,
    makeInteraction,
    promptTextWithCodeSelection,
} from '../prompts/utils'
import {
    getCurrentDirContext,
    getEditorDirContext,
    getEditorOpenTabsContext,
    getEditorSelectionContext,
    getFilePathContext,
    getHumanDisplayTextWithFileName,
    getPackageJsonContext,
    getTerminalOutputContext,
} from '../prompts/vscode-context'
import { Interaction } from '../transcript/interaction'

import { getContextMessagesFromSelection, numResults } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

/** ======================================================
 * Recipe for running custom prompts from the cody.json files
 * Works with VS Code only
====================================================== **/
export class CustomPrompt implements Recipe {
    public id: RecipeID = 'custom-prompt'

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
            return interactionWithAssistantError(errorMessage)
        }
        const promptName = (await context.editor.controllers?.command?.get('current')) || promptText
        const slashCommand = (await context.editor.controllers?.command?.get('slash')) || promptName

        // Check if selection is required. If selection is not defined, accept visible content
        const selectionContent =
            isContextNeeded?.selection === true
                ? context.editor.getActiveTextEditorSelection()
                : context.editor.getActiveTextEditorSelectionOrVisibleContent()

        const selection = selectionContent || context.editor.controllers?.inline?.selection
        if (isContextNeeded?.selection === true && !selection?.selectedText) {
            const errorMessage = `__${slashCommand}__ requires highlighted code. Please select some code in your editor and try again.`
            return interactionWithAssistantError(errorMessage, slashCommand)
        }

        // Add selection file name as display when available
        const displayText = selection?.fileName
            ? getHumanDisplayTextWithFileName(slashCommand, selection, context.editor.getWorkspaceRootUri())
            : slashCommand
        // Prompt text to share with Cody but not display to human
        const promptRuleText = isContextNeeded?.strict ? rules.hallucination : ''
        const codyPromptText = prompts.instruction.replace('{humanInput}', promptText) + promptRuleText

        // Attach code selection to prompt text if only selection is needed as context
        if (selection && isOnlySelectionRequired(isContextNeeded, selection.selectedText)) {
            const truncatedTextWithCode = promptTextWithCodeSelection(codyPromptText, selection)
            if (truncatedTextWithCode) {
                return makeInteraction(truncatedTextWithCode)
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
        return makeInteraction(truncatedText, displayText, contextMessages)
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

        // NONE
        if (isContextRequired.none) {
            return []
        }

        // CODEBASE CONTEXT
        if (isContextRequired.codebase) {
            const codebaseContextMessages = await codebaseContext.getContextMessages(text, numResults)
            contextMessages.push(...codebaseContextMessages)
        }

        // OPEN FILES IN EDITOR TABS
        if (isContextRequired.openTabs) {
            const openTabsContext = await getEditorOpenTabsContext()
            contextMessages.push(...openTabsContext)
        }

        // CURRENT DIRECTORTY
        if (isContextRequired.currentDir) {
            const isTestRequest = text.includes('test')
            const currentDirContext = await getCurrentDirContext(isTestRequest)
            const packageJSONContext = await getPackageJsonContext(selection?.fileName)
            contextMessages.push(...currentDirContext, ...(isTestRequest ? packageJSONContext : []))
        }

        // DIR PATH
        if (isContextRequired.directoryPath?.length) {
            const fileContext = await getEditorDirContext(isContextRequired.directoryPath, selection?.fileName)
            contextMessages.push(...fileContext)
        }

        // FILE PATH
        const fileContextQueue = []
        if (isContextRequired.filePath?.length) {
            const fileContext = await getFilePathContext(isContextRequired.filePath)
            fileContextQueue.push(...fileContext)
        }

        // CURRENT FILE
        const currentFileContextStack = []
        // If currentFile is true, or when selection is true but there is no selected text
        // then we want to include the current file context
        if (selection && (isContextRequired.currentFile || (isContextRequired.selection && !selection?.selectedText))) {
            const truncatedSelectedText = truncateText(selection.selectedText, MAX_RECIPE_INPUT_TOKENS)
            const truncatedPrecedingText = truncateTextStart(selection.precedingText, MAX_RECIPE_SURROUNDING_TOKENS)
            const truncatedFollowingText = truncateText(selection.followingText, MAX_RECIPE_SURROUNDING_TOKENS)
            const contextMsg = await getContextMessagesFromSelection(
                truncatedSelectedText,
                truncatedPrecedingText,
                truncatedFollowingText,
                selection,
                codebaseContext
            )
            currentFileContextStack.push(...contextMsg)
        }

        contextMessages.push(...fileContextQueue, ...currentFileContextStack)

        // SELECTED TEXT: Exclude only if selection is set to false specifically
        if (isContextRequired.selection !== false && selection?.selectedText) {
            contextMessages.push(...getEditorSelectionContext(selection))
        }

        // COMMAND OUTPUT
        if (isContextRequired.command?.length && commandOutput) {
            contextMessages.push(...getTerminalOutputContext(commandOutput))
        }

        const maxResults = Math.floor((NUM_CODE_RESULTS + NUM_TEXT_RESULTS) / 2) * 2
        return contextMessages.slice(-maxResults * 2)
    }
}
