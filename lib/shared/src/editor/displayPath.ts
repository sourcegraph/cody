import { type URI } from 'vscode-uri'

/**
 * Convert an absolute URI or file path to a (possibly shorter) path to display to the user. The
 * display path is always a path (not a URI string) and is typically is relative to the nearest
 * workspace root.
 *
 * The returned path string MUST ONLY be used for display purposes. It MUST NOT be used to identify
 * or locate files.
 *
 * You MUST call {@link setDisplayPathFn} at static init time to provide a custom implementation for
 * the environment (e.g., for VS Code).
 *
 * Why is this needed? Why not just use `uri.fsPath` or `vscode.workspace.asRelativePath`? Because:
 * (1) some URIs may encode the repository path as well, in which case we only want to show the
 * file's path within the repository; and (2) we may want to display certain internal VS Code URIs
 * with a custom title.
 */
export function displayPath(location: URI | string): string {
    if (!customFn) {
        throw new Error(
            'no custom display path function (call setDisplayPathFn; see displayPath docstring for more info)'
        )
    }
    return customFn(location)
}

let customFn: ((location: URI | string) => string) | null = null

/**
 * Provide a function that returns the path of a file relative to the nearest workspace root, to be
 * invoked by {@link displayPath}.
 * @returns the previous function
 */
export function setDisplayPathFn(fn: typeof customFn): typeof fn {
    const prev = customFn
    customFn = fn
    return prev
}
