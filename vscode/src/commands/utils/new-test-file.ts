import { type URI, Utils } from 'vscode-uri'

import { uriBasename, uriExtname, uriParseNameAndExtension } from '@sourcegraph/cody-shared'

import { isValidTestFile } from './test-commands'

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

    const extWithDot = uriExtname(file)
    const fileName = uriBasename(file, extWithDot)
    const ext = extWithDot.slice(1)

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
        const parsedCurrentFile = uriParseNameAndExtension(currentFile)
        const parsedTestFile = uriParseNameAndExtension(testFile)
        if (parsedCurrentFile.ext === parsedTestFile.ext) {
            const testFileName = parsedTestFile.name
            const index = testFileName.lastIndexOf('test') || testFileName.lastIndexOf('spec')
            const endsWithCapitalTest = testFileName.endsWith('Test') || testFileName.endsWith('Spec')
            // This checks if the existing test file has a non-alphanumeric character at the test character index
            // e.g. "_test", ".test", "test_"
            // This is because files with 'test' in the name are not always a test file, while
            // file with non-alphanumeric character before 'test' are more likely to be test files
            // e.g. "testPath" or "test-helper" are not likely test files
            const hasVerifiedTestPath = index > -1 && !/^[\da-z]$/i.test(testFileName[index - 1])
            // If yes, generate a test file by replacing existing test file name with current file name
            if (endsWithCapitalTest || hasVerifiedTestPath) {
                // Remove everything after the test character index from the existing test file name
                // then replace it with the current file name
                // e.g. "current_file" & "existing_test" => "current_file_test"
                const strippedTestFileName = testFileName.slice(0, index - 1)
                const newTestFileName = testFileName.replace(
                    strippedTestFileName,
                    parsedCurrentFile.name
                )
                return Utils.joinPath(currentFile, '..', `${newTestFileName}${parsedCurrentFile.ext}`)
            }
        }
    }

    // else, generate a generic test file
    return createDefaultTestFile(currentFile)
}
