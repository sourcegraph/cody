import { type FileURI, URI } from 'vscode-uri'
// we re-export this type as it doesn't actually exist in the original module.
export type { FileURI } from 'vscode-uri'
import { pathFunctionsForURI } from './path'
import type { URIString } from './uriString'

export const SUPPORTED_URI_SCHEMAS = new Set([
    'file',
    'untitled',
    'vscode-notebook',
    'vscode-notebook-cell',
])

/**
 * dirname, but operates on a {@link URI}.
 *
 * Use this instead of Node's `path` module because on Windows, Node `path` uses '\' as path
 * separators, which will break because URI paths are always separated with '/'.
 */
export function uriDirname(uri: URI | URIString): URI {
    uri = typeof uri === 'string' ? URI.parse(uri) : uri
    return uri.with({ path: pathFunctionsForURI(uri).dirname(uri.path) })
}

/**
 * basename, but operates on a {@link URI}'s path.
 *
 * See {@link uriDirname} for why we use this instead of Node's `path` module.
 */
export function uriBasename(uri: URI | URIString, suffix?: string): string {
    uri = typeof uri === 'string' ? URI.parse(uri) : uri
    return pathFunctionsForURI(uri).basename(uri.path, suffix)
}

/**
 * extname, but operates on a {@link URI}'s path.
 *
 * See {@link uriDirname} for why we use this instead of Node's `path` module.
 */
export function uriExtname(uri: URI | URIString): string {
    uri = typeof uri === 'string' ? URI.parse(uri) : uri
    return pathFunctionsForURI(uri).extname(uri.path)
}

/**
 * parse, but operates on a {@link URI}'s path.
 *
 * See {@link uriDirname} for why we use this instead of Node's `path` module.
 */
export function uriParseNameAndExtension(uri: URI): { name: string; ext: string } {
    const ext = uriExtname(uri)
    const name = uriBasename(uri, ext)
    return { ext, name }
}

export function isFileURI(uri: URI): uri is FileURI {
    return uri.scheme === 'file'
}

export function isFileURIString(uri: URIString): boolean {
    return uri.startsWith('file://')
}

export function assertFileURI(uri: URI): FileURI {
    if (!isFileURI(uri)) {
        throw new TypeError(`assertFileURI failed on ${uri.toString()}`)
    }
    return uri
}
