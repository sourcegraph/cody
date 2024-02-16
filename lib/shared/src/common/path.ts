import type { URI } from 'vscode-uri'

import { isWindows as _isWindows } from './platform'

export interface PathFunctions {
    /**
     * All but the last element of path, or "." if that would be the empty path.
     */
    dirname: (path: string) => string

    /**
     * The last element of path, or "" if path is empty.
     * @param path the path to operate on
     * @param suffix optional suffix to remove
     */
    basename: (path: string, suffix?: string) => string

    /** The extension of path, including the last '.'. */
    extname: (path: string) => string

    /** Path separator. */
    separator: string
}

/** For file system paths on Windows ('\' separators and drive letters). */
export const windowsFilePaths: PathFunctions = pathFunctions(true)

/**
 * For POSIX and URI paths ('/' separators).
 */
export const posixAndURIPaths: PathFunctions & {
    /**
     * The relative path from {@link from} to {@link to}.
     *
     * Only implemented for POSIX and URI paths because there are currently no callers that need
     * this for Windows paths.
     */
    relative: (from: string, to: string) => string
} = { ...pathFunctions(false), relative: posixAndURIPathsRelative }

/**
 * Get the {@link PathFunctions} to use for the given URI's path.
 */
export function pathFunctionsForURI(uri: URI, isWindows = _isWindows()): PathFunctions {
    return uri.scheme === 'file' && isWindows ? windowsFilePaths : posixAndURIPaths
}

// I don't like reimplementing this here, but it's the best option because: (1) using Node's `path`
// module requires us to configure the bundler right or risk a subtle bug (and path-browserify
// doesn't have `path/win32` support, so we'd need multiple underlying packages); and (2)
// `vscode-uri` is hard to test because it has a global constant for the current platform set at
// init time.
function pathFunctions(isWindows: boolean): PathFunctions {
    const sep = isWindows ? '\\' : '/'
    const f: PathFunctions = {
        dirname(path: string): string {
            if (path === '') {
                return '.'
            }
            if (isWindows && isDriveLetter(path)) {
                return path
            }
            if (path.endsWith(sep)) {
                path = path.slice(0, -1)
            }
            if (isWindows && isDriveLetter(path)) {
                return path + sep
            }
            if (path === '') {
                return sep
            }
            const i = path.lastIndexOf(sep)
            if (i === -1) {
                return '.'
            }
            if (i === 0) {
                return sep
            }
            path = path.slice(0, i)
            if (isWindows && isDriveLetter(path)) {
                return path + sep
            }
            return path
        },
        basename(path: string, suffix?: string): string {
            if (path.endsWith(sep)) {
                path = path.slice(0, -1)
            }
            if (isWindows && isDriveLetter(path)) {
                return ''
            }
            path = path.split(sep).at(-1) ?? ''
            if (suffix && path.endsWith(suffix)) {
                path = path.slice(0, -suffix.length)
            }
            return path
        },
        extname(path: string): string {
            const basename = f.basename(path)
            const i = basename.lastIndexOf('.')
            if (i === 0 || i === -1) {
                return ''
            }
            return basename.slice(i)
        },
        separator: sep,
    }
    return f
}

function isDriveLetter(path: string): boolean {
    return /^[A-Za-z]:$/.test(path)
}

/** The relative path from {@link from} to {@link to}. */
function posixAndURIPathsRelative(from: string, to: string): string {
    // Normalize slashes.
    from = from.replaceAll(/\/{2,}/g, '/')
    to = to.replaceAll(/\/{2,}/g, '/')

    // Trim trailing slashes.
    if (from !== '/' && from.endsWith('/')) {
        from = from.slice(0, -1)
    }
    if (to !== '/' && to.endsWith('/')) {
        to = to.slice(0, -1)
    }

    if (from === to) {
        return ''
    }

    // From a relative to an absolute path, the absolute path dominates.
    if (!from.startsWith('/') && to.startsWith('/')) {
        return to
    }

    const fromParts = from === '/' ? [''] : from.split('/')
    const toParts = to === '/' ? [''] : to.split('/')

    // Find the common root.
    let commonLength = 0
    while (
        commonLength < fromParts.length &&
        commonLength < toParts.length &&
        fromParts[commonLength] === toParts[commonLength]
    ) {
        commonLength++
    }

    // Calculate the number of directory traversals needed.
    const traversals = fromParts.length - commonLength

    // Build the relative path.
    const relativePath: string[] = []
    for (let i = 0; i < traversals; i++) {
        relativePath.push('..')
    }

    // Add the non-common path parts from the 'to' path.
    relativePath.push(...toParts.slice(commonLength))

    return relativePath.join('/')
}
