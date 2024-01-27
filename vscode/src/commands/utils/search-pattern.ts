import type * as vscode from 'vscode'
import path from 'path'

/**
 * Returns a glob pattern to search for test files.
 * Used by the unit test commands to get context files.
 *
 * @param file The current file
 * @param currentDirectoryOnly If true, only search for files in the current directory
 * @param fileNameMatchesOnly If true, only search for files with the same name as the current file
 */
export function getSearchPatternForTestFiles(
    // Current file
    file: vscode.Uri,
    // Files in the current directory only
    currentDirectoryOnly?: boolean,
    // Files with the same name as the current file
    fileNameMatchesOnly?: boolean
): string {
    const osSep = path.posix.sep
    const fileExtension = path.posix.parse(file.path).ext
    const basenameWithoutExt = path.posix.parse(file.path).name

    const testPattern = `*{test,spec}*${fileExtension}`
    const nameMatchPattern = `*{test_${basenameWithoutExt},${basenameWithoutExt}_test,test.${basenameWithoutExt},${basenameWithoutExt}.test,${basenameWithoutExt}Test,spec_${basenameWithoutExt},${basenameWithoutExt}_spec,spec.${basenameWithoutExt},${basenameWithoutExt}.spec,${basenameWithoutExt}Spec}${fileExtension}`

    // Pattern to search for test files in the current directory
    if (currentDirectoryOnly) {
        // Create a relative path using path package
        // and use regex to remove the leading separator from the path
        const dir = path.posix.parse(file.path).dir
        const osSep = path.sep
        const regex = new RegExp(`^${osSep}`)

        return dir.replace(regex, '') + osSep + testPattern
    }

    const root = '**'

    // pattern to search for test files with the same name as current file
    if (fileNameMatchesOnly) {
        return root + osSep + nameMatchPattern
    }

    return root + osSep + testPattern
}
