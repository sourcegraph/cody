import type { URI } from 'vscode-uri'

import { pathFunctionsForURI } from './path'

/**
 * dirname, but operates on a {@link URI}.
 *
 * Use this instead of Node's `path` module because on Windows, Node `path` uses '\' as path
 * separators, which will break because URI paths are always separated with '/'.
 */
export function uriDirname(uri: URI): URI {
    return uri.with({ path: pathFunctionsForURI(uri).dirname(uri.path) })
}

/**
 * basename, but operates on a {@link URI}'s path.
 *
 * See {@link uriDirname} for why we use this instead of Node's `path` module.
 */
export function uriBasename(uri: URI, suffix?: string): string {
    return pathFunctionsForURI(uri).basename(uri.path, suffix)
}

/**
 * extname, but operates on a {@link URI}'s path.
 *
 * See {@link uriDirname} for why we use this instead of Node's `path` module.
 */
export function uriExtname(uri: URI): string {
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

/**
 * A file URI.
 *
 * It is helpful to use the {@link FileURI} type instead of just {@link URI} or {@link vscode.Uri}
 * when the URI is known to be `file`-scheme-only.
 */
export type FileURI = Omit<URI, 'fsPath'> & {
    scheme: 'file'

    // Re-declare this here so it doesn't pick up the @deprecated tag on URI.fsPath.
    /**
     * The platform-specific file system path. Thank you for only using `.fsPath` on {@link FileURI}
     * types (and not vscode.Uri or URI types)! :-)
     */
    fsPath: string
}

export function isFileURI(uri: URI): uri is FileURI {
    return uri.scheme === 'file'
}

export function assertFileURI(uri: URI): FileURI {
    if (!isFileURI(uri)) {
        throw new TypeError(`assertFileURI failed on ${uri.toString()}`)
    }
    return uri
}

declare module 'vscode-uri' {
    export class URI {
        public static file(fsPath: string): FileURI

        /**
         * @deprecated Only call `.fsPath` on {@link FileURI}, which you can create with `URI.file`
         * or with the {@link isFileURI} and {@link assertFileURI} helpers.
         */
        public fsPath: string
    }
}
