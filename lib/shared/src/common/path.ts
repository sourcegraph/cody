import type { URI } from 'vscode-uri'

import { isWindows as _isWindows } from './platform'

interface PathFunctions {
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

    /**
     * The relative path from {@link from} to {@link to}.
     */
    relative: (from: string, to: string) => string

    /** Path separator. */
    separator: PathSeparator
}

/** For file system paths on Windows ('\' separators, drive letters, case-insensitive). */
export const windowsFilePaths: PathFunctions = pathFunctions(true, '\\', false)

/** For POSIX file system paths ('/' separators, case-sensitive). */
export const posixFilePaths: PathFunctions = pathFunctions(false, '/', true)

/**
 * Get the {@link PathFunctions} to use for the given URI's path ('/' separators, drive letters/case-sensitivity depend on `isWindows`).
 */
export function pathFunctionsForURI(uri: URI, isWindows = _isWindows()): PathFunctions {
    // URIs are always forward slashes even on Windows.
    const sep = '/'
    return uri.scheme === 'file' && isWindows
        ? // Like windowsFilePaths but with forward slashes.
          pathFunctions(true, sep, false)
        : posixFilePaths
}

// I don't like reimplementing this here, but it's the best option because: (1) using Node's `path`
// module requires us to configure the bundler right or risk a subtle bug (and path-browserify
// doesn't have `path/win32` support, so we'd need multiple underlying packages); and (2)
// `vscode-uri` is hard to test because it has a global constant for the current platform set at
// init time.
//
// note: case-insensitive for Windows is not strictly sound, it's possible to have case-sensitive
// volumes on Windows (and case-insensitive on other platforms), however it's impossible to tell from
// a URI/path alone whether that's the case and VS Code already assumes based on platform, so things
// are unfortunately already broken if you don't use the "defaults".
// - https://github.com/microsoft/vscode/issues/94307
// - https://github.com/microsoft/vscode/issues/177925
function pathFunctions(isWindows: boolean, sep: '\\' | '/', caseSensitive: boolean): PathFunctions {
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
        relative(from, to) {
            // For relative paths, output separator is always based on platform, even
            // if the input (sep) is forward slash/URI.
            return relative(from, to, sep, isWindows ? '\\' : '/', caseSensitive)
        },
        separator: sep,
    }
    return f
}

function isDriveLetter(path: string): boolean {
    return /^[A-Za-z]:$/.test(path)
}

/** The relative path from {@link from} to {@link to}. */
function relative(
    from: string,
    to: string,
    inputSeparator: PathSeparator,
    outputSeparator: PathSeparator,
    caseSensitive: boolean
): string {
    function equalSegments(a: string, b: string) {
        return caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase()
    }

    // Normalize extra slashes.
    if (inputSeparator === '/') {
        from = from.replaceAll(/\/{2,}/g, '/')
        to = to.replaceAll(/\/{2,}/g, '/')
    } else {
        from = from.replaceAll(/\\{2,}/g, '\\')
        to = to.replaceAll(/\\{2,}/g, '\\')
    }

    // Trim trailing slashes.
    if (from !== inputSeparator && from.endsWith(inputSeparator)) {
        from = from.slice(0, -1)
    }
    if (to !== inputSeparator && to.endsWith(inputSeparator)) {
        to = to.slice(0, -1)
    }

    if (equalSegments(from, to)) {
        return ''
    }

    // From a relative to an absolute path, the absolute path dominates.
    if (!from.startsWith(inputSeparator) && to.startsWith(inputSeparator)) {
        return to
    }

    const fromParts = from === inputSeparator ? [''] : from.split(inputSeparator)
    const toParts = to === inputSeparator ? [''] : to.split(inputSeparator)

    // Find the common root.
    let commonLength = 0
    while (
        commonLength < fromParts.length &&
        commonLength < toParts.length &&
        equalSegments(fromParts[commonLength], toParts[commonLength])
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

    return relativePath.join(outputSeparator)
}

type PathSeparator = '\\' | '/'
