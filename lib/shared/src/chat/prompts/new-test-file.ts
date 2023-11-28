import { basename, dirname, extname, join } from 'path'

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

const TEST_FILE_EXTENSIONS = new Set(['ts', 'js', 'tsx', 'jsx', 'py', 'rb', 'go', 'cs', 'cpp', 'cc'])
// Language extension that uses '.test' suffix for test files
const TEST_FILE_DOT_SUFFIX_EXTENSIONS = new Set(['js', 'ts', 'jsx', 'tsx'])
// language extension that uses '_test' suffix for test files
const TEST_FILE_DASH_SUFFIX_EXTENSIONS = new Set(['py', 'rb', 'go'])

/**
 * Generates a default test file name based on the original file name and extension.
 * @param fileName - The original file name
 * @param ext - The file extension
 * @returns The generated default test file name
 */
export function createDefaultTestFileNameByLanguageExt(fileName: string, ext: string): string {
    // remove the first dot from ext if any
    ext = ext.replace(/^\./, '')
    if (TEST_FILE_DOT_SUFFIX_EXTENSIONS.has(ext)) {
        return `${fileName}.test.${ext}`
    }

    if (TEST_FILE_DASH_SUFFIX_EXTENSIONS.has(ext)) {
        return `${fileName}_test.${ext}`
    }

    return `${fileName}Test.${ext}`
}

/**
 * Converts a file path to a test file path using the same directory and an auto-generated test file name.
 *
 * Checks if the given path is already a valid test file name. If yes, returns the same path.
 *
 * If not, generates a default test file name based on the file extension's naming conventions.
 *
 * If an existing test file path is provided, attempts to use the same naming convention. Falls back to default if naming doesn't follow conventions.
 * @param currentFilePath - Path of file to convert
 * @param existingTestFilePath - Optional path of existing test file to match naming with
 * @returns The path of the converted test file
 */
export function convertFsPathToTestFile(currentFilePath: string, existingTestFilePath?: string): string {
    if (isValidTestFileName(currentFilePath)) {
        return currentFilePath
    }

    const currentFileName = basename(currentFilePath)
    const currentFileExt = extname(currentFilePath)
    const currentFileNameWithoutExt = currentFileName.replace(currentFileExt, '')
    const dirPath = dirname(currentFilePath)

    // If there is an existing test file path, use its naming convention
    if (existingTestFilePath && isValidTestFileName(existingTestFilePath)) {
        const existingFileName = basename(existingTestFilePath)
        const existingFileExt = extname(existingTestFilePath)
        const existingFileNameWithoutExt = existingFileName.replace(existingFileExt, '')

        // Check if the existing test file has a non-alphanumeric character at the test character index
        // If so, we will use the default test file naming convention
        const testCharIndex = existingFileNameWithoutExt.toLowerCase().lastIndexOf('test')
        if (testCharIndex > -1 && !/^[\da-z]$/i.test(existingFileNameWithoutExt[testCharIndex - 1])) {
            return join(dirPath, createDefaultTestFileNameByLanguageExt(currentFileNameWithoutExt, currentFileExt))
        }

        // Use the existing file's naming convention
        // Assuming that 'existing' should be replaced with the current file name without extension
        const newTestFileName = existingFileNameWithoutExt.replace(/existing/i, currentFileNameWithoutExt)
        return join(dirPath, `${newTestFileName}${existingFileExt}`)
    }

    // If no existing test file path is provided, or it's not a valid test file name, create a generic test file name
    return join(dirPath, createDefaultTestFileNameByLanguageExt(currentFileNameWithoutExt, currentFileExt))
}
