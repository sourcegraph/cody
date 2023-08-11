import { ContextMessage } from '../../codebase-context/messages'
import { ActiveTextEditorSelection } from '../../editor'
import { CHARS_PER_TOKEN, MAX_AVAILABLE_PROMPT_LENGTH, MAX_RECIPE_INPUT_TOKENS } from '../../prompt/constants'
import { truncateText } from '../../prompt/truncation'
import { getFileExtension, getNormalizedLanguageName } from '../recipes/helpers'
import { Interaction } from '../transcript/interaction'

import { CodyPromptContext } from '.'

export async function newInteraction(args: {
    text?: string
    displayText: string
    contextMessages?: Promise<ContextMessage[]>
    assistantText?: string
    assistantDisplayText?: string
}): Promise<Interaction> {
    const { text, displayText, contextMessages, assistantText, assistantDisplayText } = args
    return Promise.resolve(
        new Interaction(
            { speaker: 'human', text, displayText },
            { speaker: 'assistant', text: assistantText, displayText: assistantDisplayText },
            Promise.resolve(contextMessages || []),
            []
        )
    )
}

/**
 * Returns a Promise resolving to an Interaction object representing an error response from the assistant.
 *
 * @param errorMsg - The error message text to include in the assistant response.
 * @param displayText - Optional human-readable display text for the request.
 * @returns A Promise resolving to the Interaction object.
 */
export async function newInteractionWithError(errorMsg: string, displayText = ''): Promise<Interaction> {
    return Promise.resolve(
        new Interaction(
            { speaker: 'human', displayText },
            { speaker: 'assistant', displayText: errorMsg, error: errorMsg },
            Promise.resolve([]),
            []
        )
    )
}

/**
 * Generates a prompt text string with the provided prompt and code selection.
 *
 * @param prompt - The prompt text to include after the code snippet.
 * @param selection - The ActiveTextEditorSelection containing the code snippet.
 * @returns The constructed prompt text string, or null if no selection provided.
 */
export function promptTextWithCodeSelection(
    prompt: string,
    selection?: ActiveTextEditorSelection | null
): string | null {
    if (!selection) {
        return null
    }
    const extension = getFileExtension(selection.fileName)
    const languageName = getNormalizedLanguageName(extension)
    const codePrefix = `I have this ${languageName} code selected in my editor from ${selection.fileName}:`

    // Use the whole context window for the prompt because we're attaching no files
    const maxTokenCount = MAX_AVAILABLE_PROMPT_LENGTH - (codePrefix.length + prompt.length) / CHARS_PER_TOKEN
    const truncatedCode = truncateText(selection.selectedText, Math.min(maxTokenCount, MAX_RECIPE_INPUT_TOKENS))
    const promptText = `${codePrefix}\n\n<selected>\n${truncatedCode}\n</selected>\n\n${prompt.replace(
        '{languageName}',
        languageName
    )}`
    return promptText
}

export function isOnlySelectionRequired(contextConfig: CodyPromptContext): boolean {
    const contextConfigLength = Object.entries(contextConfig).length
    return !contextConfig.none && ((contextConfig.selection && contextConfigLength === 1) || !contextConfigLength)
}
