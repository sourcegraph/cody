import { URI } from 'vscode-uri'

import { pathFunctionsForURI, posixFilePaths, windowsFilePaths } from '../common/path'

/**
 * Convert an absolute URI to a (possibly shorter) path to display to the user. The display path is
 * always a path (not a full URI string) and is typically is relative to the nearest workspace root.
 * The path uses OS-native path separators ('/' on macOS/Linux, '\' on Windows).
 *
 * The returned path string MUST ONLY be used for display purposes. It MUST NOT be used to identify
 * or locate files.
 *
 * You MUST call {@link setDisplayPathEnvInfo} at static init time to provide the information about
 * the environment necessary to construct the correct display path.
 *
 * Why is this needed? Why not just use:
 *
 * - `uri.fsPath`: because this is the full path, which is much harder to read than the relative
 *   path
 * - `vscode.workspace.asRelativePath`: because it's not available in webviews, and it does not
 *   handle custom URI schemes (such as if we want to represent remote files that exist on the
 *   Sourcegraph instance).
 * @param location The absolute URI to convert to a display path.
 */
export function displayPath(location: URI): string {
    const result = _displayPath(location, checkEnvInfo())
    return typeof result === 'string' ? result : result.toString()
}

/**
 * Dirname of the location's display path, to display to the user. Similar to
 * `dirname(displayPath(location))`, but it uses the right path separators in `dirname` ('\' for
 * file URIs on Windows, '/' otherwise).
 *
 * The returned path string MUST ONLY be used for display purposes. It MUST NOT be used to identify
 * or locate files.
 *
 * Use this instead of other seemingly simpler techniques to avoid a few subtle
 * bugs/inconsistencies:
 *
 * - On Windows, Node's `dirname(uri.fsPath)` breaks on a non-`file` URI on Windows because
 *   `dirname` would use '\' path separators but the URI would have '/' path separators.
 * - In a single-root workspace, Node's `dirname(uri.fsPath)` would return the root directory name,
 *   which is usually superfluous for display purposes. For example, if VS Code is open to a
 *   directory named `myproject` and there is a list of 2 search results, one `file1.txt` (at the
 *   root) and `dir/file2.txt`, then the VS Code-idiomatic way to present the results is as
 *   `file1.txt` and `file2.txt <dir>` (try it in the search sidebar to see).
 */
export function displayPathDirname(location: URI): string {
    const envInfo = checkEnvInfo()
    const result = _displayPath(location, envInfo)

    // File path.
    if (typeof result === 'string') {
        // If the result is a string, it is a path (not a URI), so we must
        // use the correct path functions.
        return envInfo.isWindows ? windowsFilePaths.dirname(result) : posixFilePaths.dirname(result)
    }

    // Otherwise, URI.
    const dirname = pathFunctionsForURI(location, envInfo.isWindows).dirname
    return result.with({ path: dirname(result.path) }).toString()
}

/**
 * Similar to `basename(displayPath(location))`, but it uses the right path separators in `basename`
 * ('\' for file URIs on Windows, '/' otherwise).
 */
export function displayPathBasename(location: URI): string {
    const envInfo = checkEnvInfo()
    const result = _displayPath(location, envInfo)

    // File path.
    if (typeof result === 'string') {
        // If the result is a string, it is a path (not a URI), so we must
        // use the correct path functions.
        return envInfo.isWindows ? windowsFilePaths.basename(result) : posixFilePaths.basename(result)
    }

    // Otherwise, URI.
    return posixFilePaths.basename(result.path)
}

/**
 * Like {@link displayPath}, but does not show `<WORKSPACE-FOLDER-BASENAME>/` as a prefix if the
 * location is in a workspace folder and there are 2 or more workspace folders.
 */
export function displayPathWithoutWorkspaceFolderPrefix(location: URI): string {
    const result = _displayPath(location, checkEnvInfo(), false)
    return typeof result === 'string' ? result : result.toString()
}

function checkEnvInfo(): DisplayPathEnvInfo {
    if (!envInfo) {
        throw new Error(
            'no environment info for displayPath function (call setDisplayPathEnvInfo; see displayPath docstring for more info)'
        )
    }
    return envInfo
}

function _displayPath(
    location: URI,
    { workspaceFolders, isWindows }: DisplayPathEnvInfo,
    includeWorkspaceFolderWhenMultiple = true
): string | URI {
    const uri = typeof location === 'string' ? URI.parse(location) : URI.from(location)

    // Mimic the behavior of vscode.workspace.asRelativePath.
    const includeWorkspaceFolder = includeWorkspaceFolderWhenMultiple && workspaceFolders.length >= 2
    for (const folder of workspaceFolders) {
        if (uriHasPrefix(uri, folder, isWindows)) {
            const pathFunctions = pathFunctionsForURI(folder)
            const workspacePrefix = folder.path.endsWith('/') ? folder.path.slice(0, -1) : folder.path
            const workspaceDisplayPrefix = includeWorkspaceFolder
                ? pathFunctions.basename(folder.path) + pathFunctions.separator
                : ''
            return fixPathSep(
                workspaceDisplayPrefix + uri.path.slice(workspacePrefix.length + 1),
                isWindows,
                uri.scheme
            )
        }
    }

    if (uri.scheme === 'file') {
        // Show the absolute file path because we couldn't find a parent workspace folder.
        return fixPathSep(uri.fsPath, isWindows, uri.scheme)
    }

    // Show the full URI for anything else.
    return uri
}

/**
 * Fixes the path separators for Windows paths. This makes it possible to write cross-platform
 * tests.
 */
function fixPathSep(fsPath: string, isWindows: boolean, scheme: string): string {
    return isWindows && scheme === 'file' ? fsPath.replaceAll('/', '\\') : fsPath
}

export function uriHasPrefix(uri: URI, prefix: URI, isWindows: boolean): boolean {
    // On Windows, it's common to have drive letter casing mismatches (VS Code's APIs tend to normalize
    // to lowercase, but many other tools use uppercase and we don't know where the context file came
    // from).
    const uriPath =
        isWindows && uri.scheme === 'file'
            ? uri.path.slice(0, 2).toUpperCase() + uri.path.slice(2)
            : uri.path
    const prefixPath =
        isWindows && prefix.scheme === 'file'
            ? prefix.path.slice(0, 2).toUpperCase() + prefix.path.slice(2)
            : prefix.path
    return (
        uri.scheme === prefix.scheme &&
        (uri.authority ?? '') === (prefix.authority ?? '') && // different URI impls treat empty different
        (uriPath === prefixPath ||
            uriPath.startsWith(prefixPath.endsWith('/') ? prefixPath : `${prefixPath}/`) ||
            (prefixPath.endsWith('/') && uriPath === prefixPath.slice(0, -1)))
    )
}

/** The information necessary for {@link displayPath} to compute a display path. */
export interface DisplayPathEnvInfo {
    workspaceFolders: URI[]
    isWindows: boolean
}

let envInfo: DisplayPathEnvInfo | null = null

/**
 * Provide the information necessary for {@link displayPath} to compute a display path.
 */
export function setDisplayPathEnvInfo(newEnvInfo: DisplayPathEnvInfo | null): DisplayPathEnvInfo | null {
    const prev = envInfo
    envInfo = newEnvInfo
    return prev
}
