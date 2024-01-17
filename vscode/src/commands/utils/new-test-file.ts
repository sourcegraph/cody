import { basename, dirname, extname, join } from 'path'

import { URI } from 'vscode-uri'

import { isValidTestFileName } from '../prompt/utils'

// Language extension that uses '.test' suffix for test files
const TEST_FILE_DOT_SUFFIX_EXTENSIONS = new Set(['js', 'ts', 'jsx', 'tsx'])
// language extension that uses '_test' suffix for test files
const TEST_FILE_DASH_SUFFIX_EXTENSIONS = new Set(['py', 'go'])
// language extension that uses '_spec' suffix for most unit test files
const TEST_FILE_SPEC_SUFFIX_EXTENSIONS = new Set(['rb'])

/**
 * NOTE: This is used as fallback when test files cannot be found in current workspace
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
    if (TEST_FILE_SPEC_SUFFIX_EXTENSIONS.has(ext)) {
        return `${fileName}_spec.${ext}`
    }

    return `${fileName}Test.${ext}`
}

/**
 * Converts a file uri to a test file uri using the same directory and an auto-generated test file name.
 *
 * Checks if the given uri is already a valid test file name. If yes, returns the same uri.
 *
 * If not, generates a default test file uri based on the file extension's naming conventions.
 *
 * If an existing test file uri is provided, attempts to use the same naming convention. Falls back to default if naming doesn't follow conventions.
 * @param currentFileUri - URI of file to convert
 * @param existingTestFileUri - Optional uri of existing test file retrived from codebase to match naming with
 * @returns The uri of the converted test file
 */
export function convertFileUriToTestFileUri(currentFileUri: URI, existingTestFileUri?: URI): URI {
    if (isValidTestFileName(currentFileUri.fsPath)) {
        return currentFileUri
    }

    const currentFileName = basename(currentFileUri.fsPath)
    const currentFileExt = extname(currentFileUri.fsPath)
    const currentFileNameWithoutExt = currentFileName.replace(currentFileExt, '')
    const dirPath = dirname(currentFileUri.fsPath)

    // If there is an existing test file path, use its naming convention
    if (existingTestFileUri?.fsPath && isValidTestFileName(existingTestFileUri.fsPath)) {
        const existingFileName = basename(existingTestFileUri.fsPath)
        const existingFileExt = extname(existingTestFileUri.fsPath)
        const existingFileNameWithoutExt = existingFileName.replace(existingFileExt, '')

        // Check if the existing test file has a non-alphanumeric character at the test character index
        // If so, we will use the default test file naming convention
        const testCharIndex =
            existingFileNameWithoutExt.toLowerCase().lastIndexOf('test') ||
            existingFileNameWithoutExt.toLowerCase().lastIndexOf('spec')
        if (testCharIndex > -1 && !/^[\da-z]$/i.test(existingFileNameWithoutExt[testCharIndex - 1])) {
            const uri = join(dirPath, createDefaultTestFileNameByLanguageExt(currentFileNameWithoutExt, currentFileExt))
            return URI.file(uri)
        }

        // Use the existing file's naming convention
        // Assuming that 'existing' should be replaced with the current file name without extension
        const newTestFileName = existingFileNameWithoutExt.replace(/existing/i, currentFileNameWithoutExt)
        return URI.file(join(dirPath, `${newTestFileName}${existingFileExt}`))
    }

    // If no existing test file path is provided, or it's not a valid test file name, create a generic test file name
    return URI.file(join(dirPath, createDefaultTestFileNameByLanguageExt(currentFileNameWithoutExt, currentFileExt)))
}
