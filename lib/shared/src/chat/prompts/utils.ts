import { basename, extname } from 'path'

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
    assistantPrefix?: string
}): Promise<Interaction> {
    const { text, displayText, contextMessages, assistantText, assistantDisplayText, assistantPrefix } = args
    const formattedPrefix = assistantPrefix ? assistantPrefix + '\n\n' : ''
    return Promise.resolve(
        new Interaction(
            { speaker: 'human', text, displayText },
            { speaker: 'assistant', text: assistantText, displayText: assistantDisplayText, prefix: formattedPrefix },
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

const TEST_FILE_EXTENSIONS = new Set(['ts', 'js', 'tsx', 'jsx', 'py', 'rb', 'go', 'cs', 'cpp', 'cc'])
// Language extension that uses '.test' suffix for test files
const TEST_FILE_DOT_SUFFIX_EXTENSIONS = new Set(['js', 'ts', 'jsx', 'tsx'])
// language extension that uses '_test' suffix for test files
const TEST_FILE_DASH_SUFFIX_EXTENSIONS = new Set(['py', 'rb', 'go', 'cs', 'cpp', 'cc'])

/**
 * Checks if the given file path is a valid test file name.
 *
 * @param filePath - The file path to check.
 * @returns True if the file name contains 'test' and has a valid test file extension, false otherwise.
 *
 * Validates that:
 * - The file extension is in the allowed test extensions list
 * - The file name contains 'test', '.' or '_' before or after 'test'
 * - The file name does not contain 'test-'
 */
export function isValidTestFileName(filePath?: string): boolean {
    if (!filePath) {
        return false
    }

    const fileNameWithExt = basename(filePath).toLowerCase()
    const extension = extname(fileNameWithExt)
    const fileName = fileNameWithExt.replace(extension, '')

    if (TEST_FILE_EXTENSIONS.has(extension)) {
        // Check if there is '.' or '_' before or after 'test'
        return /(_|.)test(_|\.)/.test(fileName) || /test(_|\.)/.test(fileName)
    }

    return fileName.includes('test') && !fileName.includes('test-')
}

/**
 * Generates a default test file name based on the original file name and extension.
 *
 * @param fileName - The original file name
 * @param ext - The file extension
 * @returns The generated default test file name
 */
export function createDefaultTestFileNameByLanguageExt(fileName: string, ext: string): string {
    if (TEST_FILE_DOT_SUFFIX_EXTENSIONS.has(ext)) {
        return `${fileName}.test${ext}`
    }

    if (TEST_FILE_DASH_SUFFIX_EXTENSIONS.has(ext)) {
        return `${fileName}_test${ext}`
    }

    return `${fileName}Test${ext}`
}
