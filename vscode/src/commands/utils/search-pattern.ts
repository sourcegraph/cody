import { posix } from 'path'
import { workspace } from 'vscode'
import { type URI, Utils } from 'vscode-uri'

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
    file: URI,
    // Files in the current directory only
    currentDirectoryOnly?: boolean,
    // Files with the same name as the current file
    fileNameMatchesOnly?: boolean
): string {
    const root = '**'
    const osSep = posix.sep
    const fileExtension = Utils.extname(file)
    const fileWithoutExt = posix.parse(file.path).name

    const testPattern = `*{test,spec}*${fileExtension}`
    const nameMatchPattern = `*{test_${fileWithoutExt},${fileWithoutExt}_test,test.${fileWithoutExt},${fileWithoutExt}.test,${fileWithoutExt}Test,spec_${fileWithoutExt},${fileWithoutExt}_spec,spec.${fileWithoutExt},${fileWithoutExt}.spec,${fileWithoutExt}Spec}${fileExtension}`

    // pattern to search for test files with the same name as current file
    if (fileNameMatchesOnly) {
        return root + osSep + nameMatchPattern
    }

    // Pattern to search for test files in the current directory
    if (currentDirectoryOnly) {
        // Create a relative path of the current directory
        const root = posix.dirname(file.path)
        const relative = workspace.asRelativePath(root)

        return relative + osSep + testPattern
    }

    return root + osSep + testPattern
}
