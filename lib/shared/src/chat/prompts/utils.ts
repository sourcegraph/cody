import { ContextMessage } from '../../codebase-context/messages'
import { ActiveTextEditorSelection } from '../../editor'
import { CHARS_PER_TOKEN, MAX_AVAILABLE_PROMPT_LENGTH, MAX_RECIPE_INPUT_TOKENS } from '../../prompt/constants'
import { truncateText } from '../../prompt/truncation'
import { getFileExtension, getNormalizedLanguageName } from '../recipes/helpers'
import { Interaction } from '../transcript/interaction'

import { CodyPromptContext } from '.'
import { prompts } from './templates'

/**
 * Creates a new Interaction object with the given parameters.
 */
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
 * Generates a prompt text string with the provided prompt and code
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
    const codePrefix = `I have this ${languageName} code selected in my editor from my codebase file ${selection.fileName}:`

    // Use the whole context window for the prompt because we're attaching no files
    const maxTokenCount = MAX_AVAILABLE_PROMPT_LENGTH - (codePrefix.length + prompt.length) / CHARS_PER_TOKEN
    const truncatedCode = truncateText(selection.selectedText, Math.min(maxTokenCount, MAX_RECIPE_INPUT_TOKENS))
    const promptText = `${codePrefix}\n\n<selected>\n${truncatedCode}\n</selected>\n\n${prompt}`.replaceAll(
        '{languageName}',
        languageName
    )
    return promptText
}

export function isOnlySelectionRequired(contextConfig: CodyPromptContext): boolean {
    const contextConfigLength = Object.entries(contextConfig).length
    return !contextConfig.none && ((contextConfig.selection && contextConfigLength === 1) || !contextConfigLength)
}

/**
 * Returns the test type from the given text, or an empty string if no test type found.
 */
export function extractTestType(text: string): string {
    // match "unit", "e2e", or "integration" that is follow by the word test, but don't include the word test in the matches
    const testTypeRegex = /(unit|e2e|integration)(?= test)/i
    return text.match(testTypeRegex)?.[0] || ''
}

// Get the non-display text for a command prompt, including the filename if provided
export function getHumanLLMText(commandInstructions: string, currentFileName?: string): string {
    const promptText = prompts.instruction.replace('{humanInput}', commandInstructions)
    if (!currentFileName) {
        return promptText
    }
    return promptText.replaceAll('{languageName}', getNormalizedLanguageName(getFileExtension(currentFileName)))
}

const leadingForwardSlashRegex = /^\/+/

/**
 * Removes leading forward slashes from slash command string.
 */
export function fromSlashCommand(slashCommand: string): string {
    return slashCommand.replace(leadingForwardSlashRegex, '')
}

/**
 * Returns command starting with a forward slash.
 */
export function toSlashCommand(command: string): string {
    // ensure there is only one leading forward slash
    return command.replace(leadingForwardSlashRegex, '').replace(/^/, '/')
}

/**
 * Returns the file name from the given file path without the extension.
 */
export function getFileNameFromPath(filePath: string): string {
    const fileName = filePath.split('/').pop()?.split('.')
    return fileName?.slice(0, -1).join('.') || filePath[0]
}

const TEST_FILE_EXTENSIONS = new Set(['ts', 'js', 'py', 'go', 'java', 'cs', 'cpp', 'cc'])

const TEST_FILE_REGEXES = {
    ts: /(test\.[^.]+)|([^.]+\.test)\.\w+/i,
    js: /(test\.[^.]+)|([^.]+\.test)\.\w+/i,
    py: /(_test\.)|(\w+test_\.)/i,
    go: /(_test\.)|(\w+test_\.)/i,
    java: /(test\.)|((\w+)test\.)/i,
    cs: /(tests?\.[\da-z]+)|([a-z]+tests?\.[a-z]+)/i,
    cpp: /(tests?\.)|([a-z]+tests?\.[a-z]+)|(_test\.)/i,
    cc: /(tests?\.)|([a-z]+tests?\.[a-z]+)|(_test\.)/i,
}

export function isValidTestFileName(filePath?: string): boolean {
    if (!filePath) {
        return false
    }

    const fileName = filePath.split('/').pop() || filePath
    const extension = getFileExtension(filePath)

    if (!TEST_FILE_EXTENSIONS.has(extension)) {
        return false
    }

    const regex = TEST_FILE_REGEXES[extension as keyof typeof TEST_FILE_REGEXES]

    return regex?.test(fileName) ?? false
}

/**
 * Remove markdown formatted code block
 */
export function markdownCodeblockRemover(codeblock: string): string {
    return codeblock
        .trimEnd()
        .replace(/```[^\n]*\n/, '')
        .replace(/```/, '')
}
