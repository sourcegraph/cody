import * as vscode from 'vscode'
import { URI } from 'vscode-uri'

import { CodebaseContext } from '../../codebase-context'
import { ContextMessage } from '../../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../../editor'
import { MAX_HUMAN_INPUT_TOKENS, NUM_CODE_RESULTS, NUM_TEXT_RESULTS } from '../../prompt/constants'
import { truncateText } from '../../prompt/truncation'
import { CodyPromptContext, defaultCodyPromptContext, getCommandEventSource } from '../prompts'
import {
    extractTestType,
    getHumanLLMText,
    isOnlySelectionRequired,
    newInteraction,
    newInteractionWithError,
} from '../prompts/utils'
import {
    extractFileUrisFromTags,
    getCurrentDirContext,
    getCurrentFileContextFromEditorSelection,
    getCurrentFileImportsContext,
    getDirectoryFileListContext,
    getDisplayTextForFileUri,
    getEditorDirContext,
    getEditorOpenTabsContext,
    getFilePathContext,
    getFileUriContext,
    getHumanDisplayTextWithFileName,
    getPackageJsonContext,
    getTerminalOutputContext,
} from '../prompts/vscode-context'
import { Interaction } from '../transcript/interaction'

import { getFileExtension, isSingleWord, numResults } from './helpers'
import { Recipe, RecipeContext, RecipeID } from './recipe'

/**
 * ======================================================
 * Recipe for running custom prompts from the cody.json files
 * Works with VS Code only
====================================================== *
 */
export class CustomPrompt implements Recipe {
    public id: RecipeID = 'custom-prompt'
    public title = 'Custom Prompt'

    /**
     * Retrieves an Interaction object based on the humanChatInput and RecipeContext provided.
     * The Interaction object contains messages from both the human and the assistant, as well as context information.
     */
    public async getInteraction(commandRunnerID: string, context: RecipeContext): Promise<Interaction | null> {
        const workspaceRootUri = context.editor.getWorkspaceRootUri()
        const command = context.editor.controllers?.command?.getCommand(commandRunnerID)

        // Chat Question
        if (commandRunnerID.startsWith('/ask ') || command?.slashCommand === '/ask') {
            const text = commandRunnerID.replace('/ask ', '')
            const truncatedText = truncateText(text, MAX_HUMAN_INPUT_TOKENS)
            const selection = context.editor.getActiveTextEditorSelection()
            // TODO bee Pass input context from context as object instead of manually extracting them
            const filePaths = extractFileUrisFromTags(text, workspaceRootUri)
            let displayText = filePaths ? text : getHumanDisplayTextWithFileName(text, selection, workspaceRootUri)
            filePaths?.map(file => {
                displayText = displayText.replace(file.tag, getDisplayTextForFileUri(file.uri))
            })
            console.log(filePaths)
            const contextMessages = this.getChatQuestionContextMessages(
                truncatedText,
                context.firstInteraction,
                context.codebaseContext,
                selection,
                filePaths
            )

            return newInteraction({ text: truncatedText, displayText, contextMessages, source: 'chat' })
        }

        if (!command) {
            const errorMessage = 'Invalid command -- command not found.'
            return newInteractionWithError(errorMessage)
        }

        // Default or Custom Commands
        const contextConfig = command?.context || defaultCodyPromptContext
        // If selection is required, ensure not to accept visible content as selection
        const selection = contextConfig?.selection
            ? await context.editor.getActiveTextEditorSmartSelection()
            : context.editor.getActiveTextEditorSelectionOrVisibleContent()

        // Get prompt text from the editor command or from the human input
        const promptText = command.prompt
        const commandName = command?.slashCommand || command?.description || promptText

        // Log all custom commands under 'custom'
        const source = getCommandEventSource(command)

        if (!promptText || !commandName) {
            const errorMessage = 'Please enter a valid prompt for the custom command.'
            return newInteractionWithError(errorMessage, promptText || '')
        }

        if (contextConfig?.selection && !selection?.selectedText) {
            const errorMessage = `__${commandName}__ requires highlighted code. Please select some code in your editor and try again.`
            return newInteractionWithError(errorMessage, commandName)
        }

        // Add selection file name as display when available
        const displayText = getHumanDisplayTextWithFileName(commandName, selection, workspaceRootUri)
        const text = getHumanLLMText(promptText, selection?.fileName)

        // Attach code selection to prompt text if only selection is needed as context
        if (selection && isOnlySelectionRequired(contextConfig)) {
            const contextMessages = Promise.resolve(getCurrentFileContextFromEditorSelection(selection))
            return newInteraction({ text, displayText, contextMessages, source })
        }

        const commandOutput = command.context?.output

        const truncatedText = truncateText(text, MAX_HUMAN_INPUT_TOKENS)
        const contextMessages = this.getContextMessages(
            truncatedText,
            context.editor,
            context.codebaseContext,
            contextConfig,
            selection,
            commandOutput
        )

        return newInteraction({ text: truncatedText, displayText, contextMessages, source })
    }

    private async getChatQuestionContextMessages(
        text: string,
        firstInteraction: boolean,
        codebaseContext: CodebaseContext,
        selection?: ActiveTextEditorSelection | null,
        fileUris?: { uri: vscode.Uri; range?: vscode.Range }[]
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []

        //  If input is less than 2 words, it means it's most likely a statement or a follow-up question that does not require additional context
        //  e,g. "hey", "hi", "why", "explain" etc.
        const isTextTooShort = isSingleWord(text)
        if (isTextTooShort) {
            return contextMessages
        }

        //  TODO bee Add codebase context if transcript does not have any context after first interaction?
        if (firstInteraction) {
            const codebaseContextMessages = await codebaseContext.getCombinedContextMessages(text, numResults)
            contextMessages.push(...codebaseContextMessages)
        }

        if (fileUris) {
            for (const fileUri of fileUris) {
                const fileMessages = await getFileUriContext(fileUri.uri, fileUri.range)
                contextMessages.push(...fileMessages)
            }
        }

        if (selection) {
            const currentFileMessages = getCurrentFileContextFromEditorSelection(selection)
            contextMessages.push(...currentFileMessages)
        }

        //  Return sliced results
        const maxResults = Math.floor((NUM_CODE_RESULTS + NUM_TEXT_RESULTS) / 2) * 2
        return contextMessages.slice(-maxResults * 2)
    }

    private async getContextMessages(
        text: string,
        editor: Editor,
        codebaseContext: CodebaseContext,
        promptContext: CodyPromptContext,
        selection?: ActiveTextEditorSelection | null,
        commandOutput?: string | null
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        const workspaceRootUri = editor.getWorkspaceRootUri()
        const isUnitTestRequest = extractTestType(text) === 'unit'

        if (promptContext.none) {
            return []
        }

        if (promptContext.codebase) {
            const codebaseMessages = await codebaseContext.getContextMessages(text, numResults)
            contextMessages.push(...codebaseMessages)
        }
        if (promptContext.openTabs) {
            const openTabsMessages = await getEditorOpenTabsContext()
            contextMessages.push(...openTabsMessages)
        }
        if (promptContext.currentDir) {
            const currentDirMessages = await getCurrentDirContext(isUnitTestRequest)
            contextMessages.push(...currentDirMessages)
        }
        if (promptContext.directoryPath) {
            const dirMessages = await getEditorDirContext(promptContext.directoryPath, selection?.fileName)
            contextMessages.push(...dirMessages)
        }
        if (promptContext.filePath) {
            const fileMessages = await getFilePathContext(promptContext.filePath)
            contextMessages.push(...fileMessages)
        }

        //  Context for unit tests requests
        if (isUnitTestRequest && contextMessages.length === 0) {
            if (selection?.fileName) {
                const importsContext = await this.getUnitTestContextMessages(selection, workspaceRootUri)
                contextMessages.push(...importsContext)
            }
        }

        if (promptContext.currentFile || promptContext.selection !== false) {
            if (selection) {
                const currentFileMessages = getCurrentFileContextFromEditorSelection(selection)
                contextMessages.push(...currentFileMessages)
            }
        }
        if (promptContext.command && commandOutput) {
            const outputMessages = getTerminalOutputContext(commandOutput)
            contextMessages.push(...outputMessages)
        }
        //  Return sliced results
        const maxResults = Math.floor((NUM_CODE_RESULTS + NUM_TEXT_RESULTS) / 2) * 2
        return contextMessages.slice(-maxResults * 2)
    }

    private async getUnitTestContextMessages(
        selection: ActiveTextEditorSelection,
        workspaceRootUri?: URI | null
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []

        if (workspaceRootUri) {
            const rootFileNames = await getDirectoryFileListContext(workspaceRootUri, true)
            contextMessages.push(...rootFileNames)
        }
        //  Add package.json content only if files matches the ts/js extension regex
        if (selection?.fileName && getFileExtension(selection?.fileName).match(/ts|js/)) {
            const packageJson = await getPackageJsonContext(selection?.fileName)
            contextMessages.push(...packageJson)
        }
        //  Try adding import statements from current file as context
        if (selection?.fileName) {
            const importsContext = await getCurrentFileImportsContext()
            contextMessages.push(...importsContext)
        }

        return contextMessages
    }
}
