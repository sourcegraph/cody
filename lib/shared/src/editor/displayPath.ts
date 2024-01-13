import { URI } from 'vscode-uri'

import { basename } from '../common'

/**
 * Convert an absolute URI or file path to a (possibly shorter) path to display to the user. The
 * display path is always a path (not a full URI string) and is typically is relative to the nearest
 * workspace root. The path uses OS-native path separators ('/' on macOS/Linux, '\' on Windows).
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
 * @param location The absolute URI or file path to convert to a display path.
 */
export function displayPath(location: URI | string): string {
    if (!envInfo) {
        throw new Error(
            'no environment info for displayPath function (call setDisplayPathEnvInfo; see displayPath docstring for more info)'
        )
    }
    return _displayPath(location, envInfo)
}

function _displayPath(location: URI | string, { workspaceFolders, isWindows }: DisplayPathEnvInfo): string {
    const uri = typeof location === 'string' ? URI.parse(location) : URI.from(location)

    // URIs always use forward slashes, but the "display path" should be an OS-native path, which
    // means backslashes for Windows file paths.
    const filePathSep = isWindows ? '\\' : '/'

    // Non-file URIs use '/' in paths on all platforms (even Windows).
    const pathSep = uri.scheme === 'file' ? filePathSep : '/'

    // Mimic the behavior of vscode.workspace.asRelativePath.
    const includeWorkspaceFolder = workspaceFolders.length >= 2
    for (const folder of workspaceFolders) {
        if (uriHasPrefix(uri, folder, isWindows)) {
            const folderPath = folder.path.endsWith('/') ? folder.path.slice(0, -1) : folder.path
            const workspaceFolderPrefix = includeWorkspaceFolder ? basename(folderPath) + pathSep : ''
            return fixPathSep(workspaceFolderPrefix + uri.path.slice(folderPath.length + 1), isWindows, uri.scheme)
        }
    }

    if (uri.scheme === 'file') {
        // Show the absolute file path because we couldn't find a parent workspace folder.
        return fixPathSep(uri.fsPath, isWindows, uri.scheme)
    }

    // Show the full URI for anything else.
    return uri.toString()
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
        isWindows && uri.scheme === 'file' ? uri.path.slice(0, 2).toUpperCase() + uri.path.slice(2) : uri.path
    const prefixPath =
        isWindows && prefix.scheme === 'file'
            ? prefix.path.slice(0, 2).toUpperCase() + prefix.path.slice(2)
            : prefix.path
    return (
        uri.scheme === prefix.scheme &&
        (uri.authority || '') === (prefix.authority || '') && // different URI impls treat empty different
        (uriPath === prefixPath ||
            uriPath.startsWith(prefixPath.endsWith('/') ? prefixPath : prefixPath + '/') ||
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
