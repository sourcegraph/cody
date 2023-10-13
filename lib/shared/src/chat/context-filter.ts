import path from 'path'

import ignore from 'ignore'

export const CODY_IGNORE_FILENAME = '.cody/.ignore'

let codyIgnored = ignore().add(['.env'])

/**
 * Checks if a file should be ignored by Cody based on the .codyignore rules.
 */
export function isCodyIgnoredFile(fileName?: string): boolean {
    if (!fileName) {
        return false
    }
    // file must be path.relative - remove '/' from the start of the path
    return codyIgnored.ignores(path.join(fileName.replace(/^\//, '')))
}

/**
 * Sets the ignore rules for Cody by parsing a .codyignore file.
 *
 *  * NOTE: Each client must call this function at startup + every time the .cody/.ignore file & workspace changes.
 *
 * Takes the contents of the .codyignore file and the workspace root directory as input.
 * Splits the file contents into lines, trims whitespace, and adds each non-empty line to a Set of ignore patterns.
 * Also adds .env files to the ignore patterns by default.
 * Converts the Set into an Array and passes it to the ignore() library to generate the ignore rules.
 * Stores the ignore instance and workspace root globally for use later in checking if a file path is ignored.
 */
export function setCodyIgnoreList(codyIgnoreFileContent: string): void {
    // Get a list of files to exclude from the codyignore file
    const patternList = new Set<string>()
    patternList.add('.env')
    // Split the content of the file by new lines
    const codyIgnoreFileLines = codyIgnoreFileContent.toString().split('\n')
    // Loop through each line of the gitignore file
    for (const line of codyIgnoreFileLines) {
        if (line.trim()) {
            patternList.add(line.trim())
        }
    }
    codyIgnored = ignore().add(Array.from(patternList))
}
