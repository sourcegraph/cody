import path from 'path'

import ignore from 'ignore'

export const CODY_IGNORE_FILENAME = '.cody/.ignore'

let codyIgnored = ignore().add(['.env'])

/**
 * Checks if a given file path is ignored by .codyignore rules.
 *
 * @param filePath - The file path to check.
 * @returns A boolean indicating if the file path is ignored.
 */
export function isCodyIgnoredFile(filePath?: string): boolean {
    if (!filePath) {
        return false
    }
    // ignores should be path.relative d string
    return codyIgnored.ignores(path.relative('/', filePath))
}

/**
 * Sets the ignore rules for Cody by parsing a .codyignore file.
 *
 * NOTE: Each client must call this function at startup + every time the.codyignore file changes.
 *
 * This will get the contents of the .codyignore file, split it into lines,
 * add any non-comment non-blank lines to a Set of ignore patterns, and add
 * that Set to the ignore module to configure the ignore rules.
 *
 * @param codyIgnoreFileContent - The contents of the .codyignore file as a string
 */
export function setCodyIgnoreList(codyIgnoreFileContent: string): void {
    // Get a list of files to exclude from the codyignore file
    const patternList = new Set<string>(['.env'])
    // Split the content of the file by new lines
    const codyIgnoreFileLines = codyIgnoreFileContent.toString().split('\n')
    // Loop through each line of the gitignore file
    for (const line of codyIgnoreFileLines) {
        // If the line starts with a #, then it is a comment and we can ignore it
        if (line.startsWith('#')) {
            continue
        }
        if (!line.trim()) {
            continue
        }
        patternList.add(line.trim())
    }
    codyIgnored = ignore().add(Array.from(patternList))
}
