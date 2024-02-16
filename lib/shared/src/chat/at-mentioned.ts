import type { ContextFile } from '../codebase-context/messages'
import { displayPath } from '../editor/displayPath'

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
    const lastAtIndex = inputBeforeCaret.lastIndexOf('@')
    if (lastAtIndex < 0 || !formInput.trim()) {
        return undefined
    }

    // Trims any existing @file text from the input.
    const inputPrefix = inputBeforeCaret.slice(0, lastAtIndex)
    const afterCaret = formInput.slice(inputCaretPosition)
    const spaceAfterCaret = afterCaret.indexOf(' ')
    const inputSuffix = !spaceAfterCaret ? afterCaret : afterCaret.slice(spaceAfterCaret)
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
export function getContextFileDisplayText(contextFile: ContextFile): string {
    const isSymbol = contextFile.type === 'symbol'
    const displayText = `@${displayPath(contextFile.uri)}`
    if (!isSymbol) {
        return displayText
    }

    const startLine = contextFile.range?.start?.line ?? 0
    const endLine = contextFile.range?.end?.line
    const range = endLine ? `:${startLine + 1}-${endLine + 1}` : ''
    const symbolName = isSymbol ? `#${contextFile.symbolName}` : ''
    return `${displayText}${range}${symbolName}`.trim()
}
