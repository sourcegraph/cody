export function countCode(code: string): { lineCount: number; charCount: number } {
    const lineCount = code.split(/\r\n|\r|\n/).length
    const charCount = code.length
    return { lineCount, charCount }
}

/**
 * Handle edge cases for code snippets where code is not pasted correctly
 * or code is multiline and the formatting is changed on paste
 */
export function matchCodeSnippets(copiedText: string, text: string): boolean {
    if (!text || !copiedText) {
        return false
    }
    // Code can be multiline, so we need to remove all new lines and spaces
    // from the copied code and changed text as formatting on paste may change the spacing
    const copiedTextNoSpace = copiedText.replaceAll(/\s/g, '')
    const textNoSpace = text?.replace(/\s/g, '')
    // check if the copied code is the same as the changed text without spaces
    return copiedTextNoSpace === textNoSpace
}
