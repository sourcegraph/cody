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
    const ext = uriExtname(uri)
    const fileNameWithoutExt = uriBasename(uri, ext)

    // For some languages we check for a prefix
    const prefixTest = /\.(?:py|rb)$/
    if (prefixTest.test(ext)) {
        if (fileNameWithoutExt.startsWith('test_')) {
            return true
        }
    }

    // All other cases we check the suffix
    const suffixTest = /([._-](test|spec))|Test|Spec$/
    return suffixTest.test(fileNameWithoutExt)
}

/**
 * Checks if the given test file path matches the path of the original file
 * by comparing stripped down versions of the paths.
 *
 * @param file - The original file URI
 * @param testFile - The possible test file URI to check
 * @returns True if the test file matches the file
 */
export function isTestFileForOriginal(file: URI, testFile: URI): boolean {
    // We assume that a file can never be its own testFile for the original file.
    // Instead make sure to test if the file IS a validTestFile.
    if (file.path === testFile.path) {
        return false
    }

    const fileDir = Utils.dirname(file)?.path
    const testDir = Utils.dirname(testFile)?.path

    // Assume not a test file for the current file if they are in different directories
    // and the testFile's file path does not include a test dir
    const pathRegex = /(?:^|\/)_{0,2}tests?_{0,2}(?:\/|$)/i
    if (fileDir !== testDir && !pathRegex.test(testDir)) {
        return false
    }

    // The file extension should match as it's rare to write a test in another language.
    if (uriExtname(file) !== uriExtname(testFile)) {
        return false
    }

    // Finally we check if the filename without typical test keywords matches. This is pretty naiive
    // but seems to cover quite a few test cases.
    const sanitizeFileName = (name: string) =>
        name
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase()
            .replace(/spec|tests?/g, '')

    const fileName = Utils.basename(file)
    const testFileName = Utils.basename(testFile)

    if (fileName.toLowerCase() === testFileName.toLowerCase() && fileName !== testFileName) {
        return false
    }

    return sanitizeFileName(fileName) === sanitizeFileName(testFileName)
}
