import { posix } from 'path'

import { Utils, type URI } from 'vscode-uri'

import { isValidTestFile } from '../prompt/utils'

// Language extension that uses '.test' suffix for test files
const TEST_FILE_DOT_SUFFIX_EXTENSIONS = new Set(['js', 'ts', 'jsx', 'tsx'])
// language extension that uses '_test' suffix for test files
const TEST_FILE_DASH_SUFFIX_EXTENSIONS = new Set(['py', 'go'])
// language extension that uses '_spec' suffix for most unit test files
const TEST_FILE_SPEC_SUFFIX_EXTENSIONS = new Set(['rb'])

/**
 * NOTE: This is only being used as fallback when test files cannot be found in current workspace
 *
 * Generates a generic test file name and path for the given file
 * based on conventions for the file extension.
 * @param file - The original file URI
 * @returns The generated test file URI
 */
export function createDefaultTestFile(file: URI): URI {
    // returns the URI unchanged if it's already a valid test file
    if (isValidTestFile(file)) {
        return file
    }

    // remove the first dot from ext
    const ext = posix.extname(file.path).slice(1)
    const fileName = posix.parse(file.path).name

    let testFileName = `${fileName}Test.${ext}`
    if (TEST_FILE_DOT_SUFFIX_EXTENSIONS.has(ext)) {
        testFileName = `${fileName}.test.${ext}`
    }
    if (TEST_FILE_DASH_SUFFIX_EXTENSIONS.has(ext)) {
        testFileName = `${fileName}_test.${ext}`
    }
    if (TEST_FILE_SPEC_SUFFIX_EXTENSIONS.has(ext)) {
        testFileName = `${fileName}_spec.${ext}`
    }

    return Utils.joinPath(file, '..', testFileName)
}

/**
 * Converts a file URI to a corresponding test file URI using conventions based on file extension.
 *
 * If not a test file, generates a default test file name based on file extension conventions.
 *
 * If existing test file URI provided, attempts to match its naming convention.
 * Falls back to default test file name if naming does not follow conventions.
 * @param currentFile - Original file to convert
 * @param testFile - Optional existing test file to match naming with
 * @returns The converted test file
 */
export function convertFileUriToTestFileUri(currentFile: URI, testFile?: URI): URI {
    // returns the URI unchanged if it's already a valid test file
    if (isValidTestFile(currentFile)) {
        return currentFile
    }

    // If there is an existing test file, create the test file following its naming convention
    if (testFile?.path && isValidTestFile(testFile)) {
        const parsedCurrentFile = posix.parse(currentFile.path)
        const parsedTestFile = posix.parse(testFile.path)
        if (parsedCurrentFile.ext === parsedTestFile.ext) {
            // Check if the existing test file has a non-alphanumeric character at the test character index
            // If so, we will create a test file following the generic naming convention
            // else, create one follow the existing test file's naming convention
            const testFileName = parsedTestFile.name.toLowerCase()
            const index = testFileName.lastIndexOf('test') || testFileName.lastIndexOf('spec')
            if (!(index > -1 && !/^[\da-z]$/i.test(testFileName[index - 1]))) {
                // Use the existing file's naming convention
                // Assuming that 'existing' should be replaced with the current file name without extension
                const newTestFileName = parsedTestFile.name.replace(/existing/i, parsedCurrentFile.name)
                return Utils.joinPath(currentFile, '..', `${newTestFileName}${parsedCurrentFile.ext}`)
            }
        }
    }

    // If no existing test file path is provided, or it's not a valid test file name, create a generic test file name
    return createDefaultTestFile(currentFile)
}
