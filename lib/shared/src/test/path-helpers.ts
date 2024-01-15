import { URI } from 'vscode-uri'

import { isWindows } from '../common/platform'

/**
 * For testing only. Return a platform-native absolute path for a filename. Tests should almost
 * always use this instead of {@link URI.file}. Only use {@link URI.file} directly if the test is
 * platform-specific.
 *
 * For macOS/Linux, it returns `/file`. For Windows, it returns `C:\file`.
 * @param relativePath The name/relative path of the file (with forward slashes).
 */
export function testFileUri(relativePath: string): URI {
    return URI.file(isWindows() ? `C:\\${relativePath.replaceAll('/', '\\')}` : `/${relativePath}`)
}
