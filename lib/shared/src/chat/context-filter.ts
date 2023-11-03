import path from 'path'

import ignore from 'ignore'

export const CODY_IGNORE_FILENAME = '.cody/.ignore'

let codyIgnored = ignore().add(['.env'])
let currentCodyIgnoreFilePath = CODY_IGNORE_FILENAME

/**
 * Checks if a file should be ignored by Cody based on the .codyignore rules.
 */
export function isCodyIgnoredFile(fsPath: string): boolean {
    try {
        // Remove .cody/.ignore path from currentCodyIgnoreFilePath
        // e.g. '/Users/user/foo/bar/.cody/.ignore' -> '/Users/user/foo/bar'
        // or in window 'c:\foo\.code\.ignore' -> 'c:\foo'
        // meaning two level up from the current ignore file path
        const ignorePath = path.dirname(path.dirname(currentCodyIgnoreFilePath))
        const relativeFilePath = path.relative(ignorePath, fsPath)
        // NOTE: path must be relative
        return codyIgnored.ignores(path.join(relativeFilePath))
    } catch {
        // TODO: let clients know that ignore rules parsing failed
        console.log('Error checking if file is ignored:', fsPath)
        return false
    }
}

/**
 * Sets the ignore rules for Cody by parsing a .codyignore file.
 *
 *  NOTE: Each client must call this function at startup + every time the .cody/.ignore file & workspace changes.
 *
 * Takes the contents of the .cody/.ignore file and the workspace root directory as input.
 * Splits the file contents into lines, trims whitespace, and adds each non-empty line to a Set of ignore patterns.
 * Also adds .env files to the ignore patterns by default.
 * Converts the Set into an Array and passes it to the ignore() library to generate the ignore rules.
 * Stores the ignore instance and workspace root globally for use later in checking if a file path is ignored.
 */
export function setCodyIgnoreList(codyIgnoreFilePath: string, codyIgnoreFileContent: string): void {
    // Store the path to use for checking pattern matches later
    currentCodyIgnoreFilePath = codyIgnoreFilePath
    // Get a list of files to exclude from the codyignore file
    const patternList = new Set<string>()
    patternList.add('.env')
    // Split the content of the file by new lines
    const codyIgnoreFileLines = codyIgnoreFileContent.split('\n')
    // Loop through each line of the gitignore file
    for (const line of codyIgnoreFileLines) {
        if (line.trim()) {
            patternList.add(line.trim())
        }
    }
    codyIgnored = ignore().add(Array.from(patternList))
}

export function deleteCodyIgnoreList(): void {
    codyIgnored = ignore()
    currentCodyIgnoreFilePath = CODY_IGNORE_FILENAME
}
