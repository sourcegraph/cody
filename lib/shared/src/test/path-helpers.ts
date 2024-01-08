import * as path from 'path'

/**
 * Builds a platform-aware absolute path for a filename.
 *
 * For POSIX platforms, returns `/file`, for windows returns
 * 'C:\file'.
 * @param name The name/relative path of the file. Always in POSIX format.
 */
export function testFilePath(name: string): string {
    // `path === path.win32` does not appear to work, even though win32 says
    // "Same as parent object on windows" ☹️
    const filePath = path.sep === path.win32.sep ? `C:\\${name}` : `/${name}`

    return path.normalize(filePath)
}
