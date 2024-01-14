import path from 'path'

/**
 * Extracts the test type from the given text.
 * @param text - The text to extract the test type from.
 * @returns The extracted test type, which will be "unit", "e2e", or "integration" if found.
 * Returns an empty string if no match is found.
 */
export function extractTestType(text: string): string {
    // match "unit", "e2e", or "integration" that is follow by the word test, but don't include the word test in the matches
    const testTypeRegex = /(unit|e2e|integration)(?= test)/i
    return text.match(testTypeRegex)?.[0] || ''
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
 * Checks if the given file path is a valid test file name.
 * @param fsPath - The file system path to check
 * @returns boolean - True if the path is a valid test file name, false otherwise.
 *
 * Removes file extension and checks if file name starts with 'test' or
 * ends with 'test', excluding files starting with 'test-'.
 * Also returns false for any files in node_modules directory.
 */
export function isValidTestFileName(fsPath: string): boolean {
    // Check if file path contains 'node_modules'
    if (fsPath.includes('node_modules')) {
        return false
    }

    const fileNameWithoutExt = path.basename(fsPath, path.extname(fsPath))

    const suffixTest = /([._-](test|spec))|Test|Spec$/

    return fileNameWithoutExt.startsWith('test_') || suffixTest.test(fileNameWithoutExt)
}

// REGEX for trailing non-alphanumeric characters
export const trailingNonAlphaNumericRegex = /[^\d#@A-Za-z]+$/
