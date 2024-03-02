import type { ContextItem } from '../../codebase-context/messages'
import { displayPath } from '../../editor/displayPath'

/**
 * Generates updated input text and caret position for auto-completing
 * @mentions in a chat input box.
 *
 * Takes the file path display text, current input text, caret position,
 * and whether the query ends with colon, and returns an object with the
 * updated input text and new caret position.
 *
 * Trims any existing @file text, inserts the new file path display text,
 * retains any text after the caret position, and moves the caret to the
 * end of the inserted display text.
 */
export function getAtMentionedInputText(
    fileDisplayText: string,
    formInput: string,
    inputCaretPosition: number,
    queryEndsWithColon = false
): { newInput: string; newInputCaretPosition: number } | undefined {
    const inputBeforeCaret = formInput.slice(0, inputCaretPosition) || ''
    const inputAfterCaret = formInput.slice(inputCaretPosition)
    const lastAtIndex = inputBeforeCaret.lastIndexOf('@')
    if (lastAtIndex < 0 || !formInput.trim()) {
        return undefined
    }

    if (/:\d+(-)?(\d+)?( )?$/.test(inputBeforeCaret)) {
        // Add a space after inputBeforeCaret to formInput
        const newInput = `${inputBeforeCaret} ${inputAfterCaret.trimStart()}`
        return { newInput, newInputCaretPosition: inputCaretPosition + 1 }
    }

    // Trims any existing @file text from the input.
    const inputPrefix = inputBeforeCaret.slice(0, lastAtIndex)
    const spaceAfterCaret = inputAfterCaret.indexOf(' ')
    const inputSuffix = !spaceAfterCaret ? inputAfterCaret : inputAfterCaret.slice(spaceAfterCaret)
    // Add empty space at the end to end the file matching process,
    // if the query ends with colon, add a colon instead as it's used for initial range selection.
    const colon = queryEndsWithColon ? ':' : ''
    const newInput = `${inputPrefix}${fileDisplayText}${colon} ${inputSuffix.trimStart()}`

    // Move the caret to the end of the newly added file display text,
    // including the length of text exisited before the lastAtIndex
    // + 1 empty whitespace added after the fileDisplayText
    const newInputCaretPosition = fileDisplayText.length + inputPrefix.length + 1
    return { newInput, newInputCaretPosition }
}

/**
 * Gets the display text for a context file to be completed into the chat when a user
 * selects a file.
 *
 * This is also used to reconstruct the map from the chat history or edit that stores context
 * files).
 *
 * e.g. @foo/bar.ts or @foo/bar.ts:1-15#baz
 */
export function getContextFileDisplayText(contextFile: ContextItem, inputBeforeCaret?: string): string {
    const isSymbol = contextFile.type === 'symbol'
    const displayText = `@${displayPath(contextFile.uri)}`

    // If the inputBeforeCaret string is provided, check if it matches the
    // expected pattern for an @mention with range query, and if so,
    // return it as this is not an autocomplete request.
    if (inputBeforeCaret) {
        const AtQueryRegex = /(^| )@[^ ]*:\d+(-\d+)?$/
        const atQuery = AtQueryRegex.exec(inputBeforeCaret)?.[0]
        if (atQuery?.startsWith(`${displayText}:`)) {
            return atQuery
        }
    }

    if (!isSymbol) {
        return displayText
    }

    const startLine = contextFile.range?.start?.line ?? 0
    const endLine = contextFile.range?.end?.line
    const range = endLine ? `:${startLine + 1}-${endLine + 1}` : ''
    const symbolName = isSymbol ? `#${contextFile.symbolName}` : ''
    return `${displayText}${range}${symbolName}`.trim()
}

/**
 * Extracts the mention query string from the given input string and caret position.
 *
 * Splits the input into before and after caret sections. Finds the last '@' before
 * the caret and extracts the text between it and the caret position as the mention
 * query.
 */
export const extractMentionQuery = (input: string, caretPos: number) => {
    // Extract mention query by splitting input value into before/after caret sections.
    const inputBeforeCaret = input.slice(0, caretPos) || ''
    const inputAfterCaret = input.slice(caretPos) || ''
    // Find the last '@' index in inputBeforeCaret to determine if it's an @mention
    const lastAtIndex = inputBeforeCaret.lastIndexOf('@')
    if (caretPos < 1 || lastAtIndex < 0 || caretPos <= lastAtIndex) {
        return ''
    }
    if (lastAtIndex - 1 > 0 && input[lastAtIndex - 1] !== ' ') {
        return ''
    }

    // Extracts text between last '@' and caret position as mention query
    // by getting the input value after the last '@' in inputBeforeCaret
    const inputPrefix = inputBeforeCaret.slice(lastAtIndex)
    const inputSuffix = inputAfterCaret.split(' ')?.[0]
    return inputPrefix + inputSuffix
}

/**
 * Extracts the at mention query from the given input string and caret position.
 *
 * Calls extractMentionQuery to extract the mention query if there is a caret position.
 * Otherwise checks if it is an at range query and returns the input.
 * Returns empty string if no query.
 */
export const getAtMentionQuery = (input: string, caretPos: number) => {
    return caretPos ? extractMentionQuery(input, caretPos) : isAtRange(input) ? input : ''
}

/**
 * At mention should start with @ and contains no whitespaces in between
 */
export const isAtMention = (text: string) => /^@[^ ]*( )?$/.test(text)

/**
 * Checks if the given text is an at-range query of the form '@start:end'
 * or '@start-end'.
 */
export const isAtRange = (text: string) => /(^| )@[^ ]*:(\d+)?(-)?(\d+)?$/.test(text)
