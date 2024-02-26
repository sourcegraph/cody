import { type URI, Utils } from 'vscode-uri'

import { uriBasename, uriExtname } from '@sourcegraph/cody-shared'

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

/**
 * Checks if the given file uri has a valid test file name.
 * @param uri - The file uri to check
 *
 * Removes file extension and checks if file name starts with 'test' or
 * ends with 'test', excluding files starting with 'test-'.
 * Also returns false for any files in node_modules directory.
 */
export function isValidTestFile(uri: URI): boolean {
    const fileNameWithoutExt = uriBasename(uri, uriExtname(uri))

    const suffixTest = /([._-](test|spec))|Test|Spec$/

    return fileNameWithoutExt.startsWith('test_') || suffixTest.test(fileNameWithoutExt)
}

// REGEX for trailing non-alphanumeric characters
export const trailingNonAlphaNumericRegex = /[^\d#@A-Za-z]+$/

/**
 * Checks if the given test file path matches the path of the original file
 * by comparing stripped down versions of the paths.
 *
 * @param file - The original file URI
 * @param testFile - The possible test file URI to check
 * @returns True if the test file matches the file
 */
export function isTestFileForOriginal(file: URI, testFile: URI): boolean {
    // Assume not a test file for the current file if they are in different directories
    if (Utils.dirname(file)?.path !== Utils.dirname(testFile)?.path) {
        return false
    }

    const regex = /[^a-zA-Z0-9]/g
    const fileName = Utils.basename(file).toLowerCase().replace(regex, '')
    const testFileName = Utils.basename(testFile).toLowerCase().replace(regex, '')

    const strippedFile = fileName.replace('spec', '').replace('test', '')
    const strippedTestFile = testFileName.replace('spec', '').replace('test', '')

    return strippedFile === strippedTestFile
}
