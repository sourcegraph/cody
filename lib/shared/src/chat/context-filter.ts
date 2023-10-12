export const CodyIgnoreFileName = '.codyignore'

let codyIgnoreList: string[] = []

/**
 * Checks if the given file name should be ignored by Cody.
 *
 * @param fileName - The file name to check.
 * @returns A boolean indicating if the file should be ignored.
 */
export function isCodyIgnoreFile(fileName?: string): boolean {
    if (!fileName) {
        return false
    }
    // check if the file name is included by one of the gitignore patterns defined in codyIgnoreList
    // the pattern is a regex, so we need to escape the special characters
    for (const pattern of codyIgnoreList) {
        if (new RegExp(pattern).test(fileName)) {
            return true
        }
    }
    return false
}

/**
 * Parses a Cody ignore file content and sets the global codyIgnoreList array with the rules.
 *
 * NOTE: Each client should call this function at the start of the client, and every time the.codyignore file changes.
 *
 * The codyIgnoreFileContent string is split into lines. Each non-comment, non-blank line has
 * the leading ! removed and is added to a Set to remove duplicates. Finally the Set is converted to an array.
 *
 * This allows efficiently parsing a ignore file while removing duplicate rules.
 *
 * @param codyIgnoreFileContent - The raw string content of the .codyignore file
 */
export function setCodyIgnoreList(codyIgnoreFileContent: string): void {
    // Get a list of files to exclude from the codyignore file
    const filesToExclude = new Set<string>(['.env'])
    // Split the content of the file by new lines
    const codyIgnoreFileLines = codyIgnoreFileContent.toString().split('\n')
    // Loop through each line of the gitignore file
    for (const line of codyIgnoreFileLines) {
        // If the line starts with a #, then it is a comment and we can ignore it
        if (line.startsWith('#')) {
            continue
        }
        // If the line is blank, then we can ignore it
        if (!line.trim()) {
            continue
        }
        // Add the rule to the list of rules to exclude
        filesToExclude.add(patternToRegExpString(line.trim()))
    }
    codyIgnoreList = Array.from(filesToExclude)
}

function patternToRegExpString(pattern: string): string {
    // Escape special characters and convert '*' and '?' to their regex equivalents
    return pattern
        .replace(/^\*\*\//, '')
        .replaceAll('*', '.*')
        .replaceAll('?', '.')
}
