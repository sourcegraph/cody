// NOTE: This is a really bad way of extending the types from vscode-uri, but
// given that it's a package that barely gets updated it should be fairly
// stable.

// In Typescript < 5.4 this was done with a simple merge of class declarations.
// However this only worked due to mis-use of a bug which got fixed in 5.5. To
// not get locked into TS 5.4 we now simply re-declare the entire module.

// All of this effort is so that we can override the `file()` method so that it
// returns an explicit FileURI This simple type-check saves enought headaches to
// warrant this attrocity of a d.ts file until we can spend more time on a
// better solution.

declare module 'vscode-uri' {
    export namespace Utils {
        /**
         * Joins one or more input paths to the path of URI.
         * '/' is used as the directory separation character.
         *
         * The resolved path will be normalized. That means:
         *  - all '..' and '.' segments are resolved.
         *  - multiple, sequential occurences of '/' are replaced by a single instance of '/'.
         *  - trailing separators are preserved.
         *
         * @param uri The input URI.
         * @param paths The paths to be joined with the path of URI.
         * @returns A URI with the joined path. All other properties of the URI (scheme, authority, query, fragments, ...) will be taken from the input URI.
         */
        function joinPath(uri: URI, ...paths: string[]): URI
        /**
         * Resolves one or more paths against the path of a URI.
         * '/' is used as the directory separation character.
         *
         * The resolved path will be normalized. That means:
         *  - all '..' and '.' segments are resolved.
         *  - multiple, sequential occurences of '/' are replaced by a single instance of '/'.
         *  - trailing separators are removed.
         *
         * @param uri The input URI.
         * @param paths The paths to resolve against the path of URI.
         * @returns A URI with the resolved path. All other properties of the URI (scheme, authority, query, fragments, ...) will be taken from the input URI.
         */
        function resolvePath(uri: URI, ...paths: string[]): URI
        /**
         * Returns a URI where the path is the directory name of the input uri, similar to the Unix dirname command.
         * In the path, '/' is recognized as the directory separation character. Trailing directory separators are ignored.
         * The orignal URI is returned if the URIs path is empty or does not contain any path segments.
         *
         * @param uri The input URI.
         * @return The last segment of the URIs path.
         */
        function dirname(uri: URI): URI
        /**
         * Returns the last segment of the path of a URI, similar to the Unix basename command.
         * In the path, '/' is recognized as the directory separation character. Trailing directory separators are ignored.
         * The empty string is returned if the URIs path is empty or does not contain any path segments.
         *
         * @param uri The input URI.
         * @return The base name of the URIs path.
         */
        function basename(uri: URI): string
        /**
         * Returns the extension name of the path of a URI, similar to the Unix extname command.
         * In the path, '/' is recognized as the directory separation character. Trailing directory separators are ignored.
         * The empty string is returned if the URIs path is empty or does not contain any path segments.
         *
         * @param uri The input URI.
         * @return The extension name of the URIs path.
         */
        function extname(uri: URI): string
    }

    /**
     * Uniform Resource Identifier (URI) http://tools.ietf.org/html/rfc3986.
     * This class is a simple parser which creates the basic component parts
     * (http://tools.ietf.org/html/rfc3986#section-3) with minimal validation
     * and encoding.
     *
     * ```txt
     *       foo://example.com:8042/over/there?name=ferret#nose
     *       \_/   \______________/\_________/ \_________/ \__/
     *        |           |            |            |        |
     *     scheme     authority       path        query   fragment
     *        |   _____________________|__
     *       / \ /                        \
     *       urn:example:animal:ferret:nose
     * ```
     */
    export class URI implements UriComponents {
        static isUri(thing: any): thing is URI
        /**
         * scheme is the 'http' part of 'http://www.example.com/some/path?query#fragment'.
         * The part before the first colon.
         */
        readonly scheme: string
        /**
         * authority is the 'www.example.com' part of 'http://www.example.com/some/path?query#fragment'.
         * The part between the first double slashes and the next slash.
         */
        readonly authority: string
        /**
         * path is the '/some/path' part of 'http://www.example.com/some/path?query#fragment'.
         */
        readonly path: string
        /**
         * query is the 'query' part of 'http://www.example.com/some/path?query#fragment'.
         */
        readonly query: string
        /**
         * fragment is the 'fragment' part of 'http://www.example.com/some/path?query#fragment'.
         */
        readonly fragment: string
        /**
         * @internal
         */
        protected constructor(
            scheme: string,
            authority?: string,
            path?: string,
            query?: string,
            fragment?: string,
            _strict?: boolean
        )
        /**
         * @internal
         */
        protected constructor(components: UriComponents)
        /**
     * Returns a string representing the corresponding file system path of this URI.
     * Will handle UNC paths, normalizes windows drive letters to lower-case, and uses the
     * platform specific path separator.
     *
     * * Will *not* validate the path for invalid characters and semantics.
     * * Will *not* look at the scheme of this URI.
     * * The result shall *not* be used for display purposes but for accessing a file on disk.
     *
     *
     * The *difference* to `URI#path` is the use of the platform specific separator and the handling
     * of UNC paths. See the below sample of a file-uri with an authority (UNC path).
     *
     * ```ts
        const u = URI.parse('file://server/c$/folder/file.txt')
        u.authority === 'server'
        u.path === '/shares/c$/file.txt'
        u.fsPath === '\\server\c$\folder\file.txt'
    ```
     *
     * Using `URI#path` to read a file (using fs-apis) would not be enough because parts of the path,
     * namely the server name, would be missing. Therefore `URI#fsPath` exists - it's sugar to ease working
     * with URIs that represent files on disk (`file` scheme).
     */
        get fsPath(): string
        with(change: {
            scheme?: string
            authority?: string | null
            path?: string | null
            query?: string | null
            fragment?: string | null
        }): URI
        /**
         * Creates a new URI from a string, e.g. `http://www.example.com/some/path`,
         * `file:///usr/home`, or `scheme:with/path`.
         *
         * @param value A string which represents an URI (see `URI#toString`).
         */
        static parse(value: string, _strict?: boolean): URI
        /**
     * Creates a new URI from a file system path, e.g. `c:\my\files`,
     * `/usr/home`, or `\\server\share\some\path`.
     *
     * The *difference* between `URI#parse` and `URI#file` is that the latter treats the argument
     * as path, not as stringified-uri. E.g. `URI.file(path)` is **not the same as**
     * `URI.parse('file://' + path)` because the path might contain characters that are
     * interpreted (# and ?). See the following sample:
     * ```ts
    const good = URI.file('/coding/c#/project1');
    good.scheme === 'file';
    good.path === '/coding/c#/project1';
    good.fragment === '';
    const bad = URI.parse('file://' + '/coding/c#/project1');
    bad.scheme === 'file';
    bad.path === '/coding/c'; // path is now broken
    bad.fragment === '/project1';
    ```
     *
     * @param path A file system path (see `URI#fsPath`)
     */
        static file(path: string): FileURI
        static from(components: {
            scheme: string
            authority?: string
            path?: string
            query?: string
            fragment?: string
        }): URI
        /**
         * Creates a string representation for this URI. It's guaranteed that calling
         * `URI.parse` with the result of this function creates an URI which is equal
         * to this URI.
         *
         * * The result shall *not* be used for display purposes but for externalization or transport.
         * * The result will be encoded using the percentage encoding and encoding happens mostly
         * ignore the scheme-specific encoding rules.
         *
         * @param skipEncoding Do not encode the result, default is `false`
         */
        toString(skipEncoding?: boolean): string
        toJSON(): UriComponents
        static revive(data: UriComponents | URI): URI
        static revive(data: UriComponents | URI | undefined): URI | undefined
        static revive(data: UriComponents | URI | null): URI | null
        static revive(data: UriComponents | URI | undefined | null): URI | undefined | null
    }
    export interface UriComponents {
        scheme: string
        authority: string
        path: string
        query: string
        fragment: string
    }

    //NOTE: This doesn't extually exist in the original module
    /**
     * A file URI.
     *
     * It is helpful to use the {@link FileURI} type instead of just {@link URI} or {@link vscode.Uri}
     * when the URI is known to be `file`-scheme-only.
     */
    export type FileURI = Omit<URI, 'fsPath'> & {
        scheme: 'file'

        //NOTE: Re-declare this here so it doesn't pick up the @deprecated tag on URI.fsPath.
        /**
         * The platform-specific file system path. Thank you for only using `.fsPath` on {@link FileURI}
         * types (and not vscode.Uri or URI types)! :-)
         */
        fsPath: string
    }

    /**
     * Compute `fsPath` for the given uri
     */
    export function uriToFsPath(uri: URI, keepDriveLetterCasing: boolean): string
    /**
     * Mapped-type that replaces all occurrences of URI with UriComponents
     */
    export type UriDto<T> = {
        [K in keyof T]: T[K] extends URI ? UriComponents : UriDto<T[K]>
    }
}
