import { CodebaseContext } from '../../codebase-context'
import { ContextFile, ContextMessage } from '../../codebase-context/messages'
import { ActiveTextEditorSelection, Editor } from '../../editor'
import { MAX_HUMAN_INPUT_TOKENS, NUM_CODE_RESULTS, NUM_TEXT_RESULTS } from '../../prompt/constants'
import { truncateText } from '../../prompt/truncation'
import { CodyPromptContext, defaultCodyPromptContext, getCommandEventSource } from '../prompts'
import { createDisplayTextWithFileLinks, createDisplayTextWithFileSelection } from '../prompts/display-text'
import {
    extractTestType,
    getHumanLLMText,
    isOnlySelectionRequired,
    newInteraction,
    newInteractionWithError,
} from '../prompts/utils'
import { VSCodeEditorContext } from '../prompts/vscode-context/VSCodeEditorContext'
import { Interaction } from '../transcript/interaction'

import { ChatQuestion } from './chat-question'
import { numResults } from './helpers'
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
        const command = context.editor.controllers?.command?.getCommand(commandRunnerID)
        if (!command) {
            return createInteractionForError('command')
        }
        const isChatQuestion = command?.slashCommand === '/ask'

        const contextConfig = command?.context || defaultCodyPromptContext
        // If selection is required, ensure not to accept visible content as selection
        const selection = contextConfig?.selection
            ? await context.editor.getActiveTextEditorSmartSelection()
            : context.editor.getActiveTextEditorSelectionOrVisibleContent()

        // Get prompt text from the editor command or from the human input
        const commandAdditionalInput = command.additionalInput
        const promptText = commandAdditionalInput ? `${command.prompt}\n${commandAdditionalInput}` : command.prompt
        const commandName = isChatQuestion ? promptText : command.slashCommand || promptText

        // Log all custom commands under 'custom'
        const source = getCommandEventSource(command)

        if (!promptText) {
            return createInteractionForError('prompt', promptText)
        }

        if (contextConfig?.selection && !selection?.selectedText) {
            return createInteractionForError('selection', commandName)
        }

        const text = getHumanLLMText(promptText, selection?.fileName)

        const commandOutput = command.context?.output
        const contextFiles = command.contextFiles

        // Add selection file name as display when available
        const displayText = contextFiles?.length
            ? createDisplayTextWithFileLinks(contextFiles, promptText)
            : contextConfig.currentFile || contextConfig.selection
            ? createDisplayTextWithFileSelection(
                  commandAdditionalInput ? `${commandName} ${commandAdditionalInput}` : commandName,
                  selection
              )
            : `${commandName} ${commandAdditionalInput}`.trim()

        const truncatedText = truncateText(text, MAX_HUMAN_INPUT_TOKENS)

        const editorContext = new VSCodeEditorContext(context.editor, selection)

        // Attach code selection to prompt text if only selection is needed as context
        if (selection && isOnlySelectionRequired(contextConfig)) {
            const contextMessages = Promise.resolve(editorContext.getCurrentFileContextFromEditorSelection())
            return newInteraction({ text, displayText, contextMessages, source })
        }

        const contextMessages = this.getContextMessages(
            editorContext,
            promptText,
            context.editor,
            context.codebaseContext,
            contextConfig,
            selection,
            context.userInputContextFiles,
            commandOutput
        )

        return newInteraction({ text: truncatedText, displayText, contextMessages, source })
    }

    private async getContextMessages(
        editorContext: VSCodeEditorContext,
        promptText: string,
        editor: Editor,
        codebaseContext: CodebaseContext,
        contextConfig: CodyPromptContext,
        selection?: ActiveTextEditorSelection | null,
        contextFiles?: ContextFile[],
        commandOutput?: string | null
    ): Promise<ContextMessage[]> {
        const contextMessages: ContextMessage[] = []
        const workspaceRootUri = editor.getWorkspaceRootUri()
        const isUnitTestRequest = extractTestType(promptText) === 'unit'

        if (contextConfig.none) {
            return []
        }

        if (contextConfig.codebase) {
            const codebaseMessages = await codebaseContext.getContextMessages(promptText, numResults)
            contextMessages.push(...codebaseMessages)
        }

        if (contextConfig.openTabs) {
            const openTabsMessages = await editorContext.getEditorOpenTabsContext()
            contextMessages.push(...openTabsMessages)
        }

        if (contextConfig.currentDir) {
            const currentDirMessages = await editorContext.getCurrentDirContext(isUnitTestRequest)
            contextMessages.push(...currentDirMessages)
        }

        if (contextConfig.directoryPath) {
            const dirMessages = await editorContext.getEditorDirContext(
                contextConfig.directoryPath,
                selection?.fileName
            )
            contextMessages.push(...dirMessages)
        }

        if (contextConfig.filePath) {
            const fileMessages = await editorContext.getFilePathContext(contextConfig.filePath)
            contextMessages.push(...fileMessages)
        }

        // Context for unit tests requests
        if (isUnitTestRequest && contextMessages.length === 0) {
            if (selection?.fileName) {
                const importsContext = await editorContext.getUnitTestContextMessages(selection, workspaceRootUri)
                contextMessages.push(...importsContext)
            }
        }

        if (contextConfig.currentFile || contextConfig.selection !== false) {
            const currentFileMessages = editorContext.getCurrentFileContextFromEditorSelection()
            contextMessages.push(...currentFileMessages)
        }

        if (contextConfig.command && commandOutput) {
            const outputMessages = editorContext.getTerminalOutputContext(commandOutput)
            contextMessages.push(...outputMessages)
        }

        if (contextFiles?.length) {
            const contextFileMessages = await ChatQuestion.getContextFilesContext(editor, contextFiles)
            contextMessages.push(...contextFileMessages)
        }

        // Return sliced results
        const maxResults = Math.floor((NUM_CODE_RESULTS + NUM_TEXT_RESULTS) / 2) * 2
        return contextMessages.slice(-maxResults * 2)
    }
}

function createInteractionForError(errorType: 'command' | 'prompt' | 'selection', args?: string): Promise<Interaction> {
    switch (errorType) {
        case 'command':
            return newInteractionWithError('Invalid command -- command not found.')
        case 'prompt':
            return newInteractionWithError('Please enter a valid prompt for the custom command.', args || '')
        case 'selection':
            return newInteractionWithError(
                `__${args}__ requires highlighted code. Please select some code in your editor and try again.`,
                args
            )
    }
}
