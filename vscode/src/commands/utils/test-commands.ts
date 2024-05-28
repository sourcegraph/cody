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
    // and the testFile's file path does not include a test dir
    const pathRegex = /_*tests?_*/i
    if (Utils.dirname(file)?.path !== Utils.dirname(testFile)?.path) {
        if (!pathRegex.test(Utils.dirname(testFile)?.path)) {
            return false
        }
    }

    // The file extension should match as it's rare to write a test in another language.
    // We only copare the last part of the extension to deal with things like `file.spec.ts`
    const fileExtension = Utils.extname(file).split('.').pop()
    const testFileExtension = Utils.extname(testFile).split('.').pop()
    if (fileExtension !== testFileExtension) {
        return false
    }

    // Finally we check if the filename without typical test keywords matches. This is pretty naiive
    // but seems to cover quite a few test cases.
    const filenameExcludedCharRegex = /[^a-zA-Z0-9]/g

    const fileName = Utils.basename(file).toLowerCase().replace(filenameExcludedCharRegex, '')
    const testFileName = Utils.basename(testFile).toLowerCase().replace(filenameExcludedCharRegex, '')

    const filenameExcludedPatternsRegex = /spec|tests?/g

    const strippedFile = fileName.replaceAll(filenameExcludedPatternsRegex, '')
    const strippedTestFile = testFileName.replaceAll(filenameExcludedPatternsRegex, '')

    return strippedFile === strippedTestFile
}
